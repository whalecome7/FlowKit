# Trigger 保活与权限实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让短信触发器 24h 保活（前台服务 + 短信豁免广播 + 开机自启 + 电池白名单），真实短信自动触发 4 动作，权限请求流程完备。

**Architecture:** 原生层（Kotlin）新增 SmsReceiver（SMS_RECEIVED 豁免广播，被杀也能唤醒）、KeepAliveService（前台服务常驻通知）、BootReceiver（开机自启）、SmsBridgeModule（NativeModule 事件通道 + 电池优化方法）；JS 层新增 SmsBridge（事件 → processSms + 竞态补发）与 Permissions（权限编排 + 状态 store）；RuleListScreen 首次进入触发权限请求与保活服务。

**Tech Stack:** React Native 0.86, Kotlin, ForegroundService, BroadcastReceiver, DeviceEventEmitter, PermissionsAndroid, Notifee, Zustand

**Spec:** `docs/superpowers/specs/2026-08-13-trigger-keepalive-design.md`

---

### Task 1: Manifest 权限补齐

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: 增加权限声明**

在 `android/app/src/main/AndroidManifest.xml` 的 `<manifest>` 标签内（现有 INTERNET/VIBRATE/POST_NOTIFICATIONS 之后）追加：

```xml
    <uses-permission android:name="android.permission.RECEIVE_SMS" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
```

- [ ] **Step 2: 注册 4 个原生组件（Receiver/Service）**

在 `<application>` 标签内、`</application>` 之前追加（Receiver/Service 类将在后续任务创建，先注册占位）：

```xml
      <receiver
        android:name=".SmsReceiver"
        android:exported="true"
        android:permission="android.permission.BROADCAST_SMS">
        <intent-filter android:priority="1000">
          <action android:name="android.provider.Telephony.SMS_RECEIVED" />
        </intent-filter>
      </receiver>
      <receiver
        android:name=".BootReceiver"
        android:exported="true">
        <intent-filter>
          <action android:name="android.intent.action.BOOT_COMPLETED" />
          <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
        </intent-filter>
      </receiver>
      <service
        android:name=".KeepAliveService"
        android:exported="false"
        android:foregroundServiceType="specialUse">
        <property
          android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
          android:value="sms_keepalive" />
      </service>
```

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat: declare sms/foreground-service/boot permissions and register native components"
```

---

### Task 2: KeepAliveService 前台服务

**Files:**
- Create: `android/app/src/main/java/com/flowkit/KeepAliveService.kt`

- [ ] **Step 1: 编写前台服务**

Write to `android/app/src/main/java/com/flowkit/KeepAliveService.kt`:

```kotlin
package com.flowkit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** 保活前台服务：常驻通知「FlowKit 正在监听短信」 */
class KeepAliveService : Service() {

  override fun onCreate() {
    super.onCreate()
    startForegroundCompat()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundCompat()
    return START_STICKY // 被系统回收后尝试重建
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startForegroundCompat() {
    val channelId = "flowkit-keepalive"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "FlowKit 保活", NotificationManager.IMPORTANCE_MIN)
      )
    }
    val contentIntent = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE
    )
    val notification: Notification =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, channelId)
          .setContentTitle("FlowKit 正在监听短信")
          .setContentText("用于及时提醒重要短信")
          .setSmallIcon(android.R.drawable.ic_popup_sync)
          .setContentIntent(contentIntent)
          .setOngoing(true)
          .build()
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
          .setContentTitle("FlowKit 正在监听短信")
          .setContentText("用于及时提醒重要短信")
          .setSmallIcon(android.R.drawable.ic_popup_sync)
          .setContentIntent(contentIntent)
          .setOngoing(true)
          .build()
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(1, notification)
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add android/app/src/main/java/com/flowkit/KeepAliveService.kt
git commit -m "feat: add keepalive foreground service with persistent notification"
```

---

### Task 3: SmsReceiver 短信广播接收器

**Files:**
- Create: `android/app/src/main/java/com/flowkit/SmsReceiver.kt`

- [ ] **Step 1: 编写短信接收器**

Write to `android/app/src/main/java/com/flowkit/SmsReceiver.kt`:

```kotlin
package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/** 短信广播接收器：解析 SMS_RECEIVED，拉起保活服务并转发给 JS */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val body = StringBuilder()
    for (m in messages) body.append(m.messageBody ?: "")
    val sender = messages[0].originatingAddress ?: ""

    Log.d("SmsReceiver", "SMS from $sender: $body")

    // 确保保活服务在跑
    val serviceIntent = Intent(context, KeepAliveService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }

    // 转发给 JS（App 被杀时先缓存，JS 就绪后补发）
    SmsBridgeModule.emitSms(sender, body.toString())
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add android/app/src/main/java/com/flowkit/SmsReceiver.kt
git commit -m "feat: add sms broadcast receiver that wakes keepalive and forwards to JS"
```

---

### Task 4: BootReceiver 开机自启

**Files:**
- Create: `android/app/src/main/java/com/flowkit/BootReceiver.kt`

- [ ] **Step 1: 编写开机自启接收器**

Write to `android/app/src/main/java/com/flowkit/BootReceiver.kt`:

```kotlin
package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** 开机 / 应用升级后自动重启保活服务 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action
    if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return

    val service = Intent(context, KeepAliveService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(service)
    } else {
      context.startService(service)
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add android/app/src/main/java/com/flowkit/BootReceiver.kt
git commit -m "feat: restart keepalive service on boot and app update"
```

---

### Task 5: SmsBridgeModule 原生模块（事件通道 + 电池优化）

**Files:**
- Create: `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`
- Modify: `android/app/src/main/java/com/flowkit/FlowKitPackage.kt`

- [ ] **Step 1: 编写原生模块**

Write to `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`:

```kotlin
package com.flowkit

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** 短信桥接模块：启动保活服务、电池优化、短信事件通道 */
class SmsBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun startService() {
    val intent = Intent(reactApplicationContext, KeepAliveService::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      reactApplicationContext.startForegroundService(intent)
    } else {
      reactApplicationContext.startService(intent)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(callback: Callback) {
    val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val exempt = pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: false
    callback.invoke(exempt)
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations() {
    val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val exempt = pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: false
    if (!exempt) {
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${reactApplicationContext.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
    }
  }

  @ReactMethod
  fun getPendingSms(callback: Callback) {
    val sms = pendingSms
    if (sms != null) {
      callback.invoke(
        Arguments.createMap().apply {
          putString("sender", sms.first)
          putString("body", sms.second)
        }
      )
    } else {
      callback.invoke()
    }
  }

  private fun sendEvent(sender: String, body: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(
        EVENT_NAME,
        Arguments.createMap().apply {
          putString("sender", sender)
          putString("body", body)
        }
      )
  }

  companion object {
    const val NAME = "SmsBridge"
    const val EVENT_NAME = "onSmsReceived"

    @Volatile
    private var pendingSms: Pair<String, String>? = null

    private var instance: SmsBridgeModule? = null

    /** 由 SmsReceiver 调用：App 在前台直接发事件，否则缓存待 JS 补发 */
    fun emitSms(sender: String, body: String) {
      pendingSms = sender to body
      instance?.sendEvent(sender, body)
    }
  }

  init {
    instance = this
  }
}
```

- [ ] **Step 2: FlowKitPackage 注册新模块**

Replace `android/app/src/main/java/com/flowkit/FlowKitPackage.kt`:

```kotlin
package com.flowkit

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** FlowKit 自研原生模块包注册 */
class FlowKitPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(
    RingtoneModule(reactContext),
    SmsBridgeModule(reactContext),
  )

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
```

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/flowkit/SmsBridgeModule.kt android/app/src/main/java/com/flowkit/FlowKitPackage.kt
git commit -m "feat: add SmsBridge native module with event channel and battery optimization"
```

---

### Task 6: JS 侧 SmsBridge 封装

**Files:**
- Create: `src/modules/trigger/services/SmsBridge.ts`

- [ ] **Step 1: 编写 JS 封装**

Write to `src/modules/trigger/services/SmsBridge.ts`:

```typescript
import { NativeModules, NativeEventEmitter } from 'react-native';
import { useTriggerStore } from '../store';

const { SmsBridge } = NativeModules;

let initialized = false;

/**
 * 初始化短信桥接：注册事件监听 + 竞态补发 + 启动保活服务。
 * 在模块注册时调用一次。
 */
export function initSmsBridge(): void {
  if (!SmsBridge || initialized) return;

  const emitter = new NativeEventEmitter(SmsBridge);
  emitter.addListener(
    'onSmsReceived',
    (event: { sender: string; body: string }) => {
      void useTriggerStore.getState().processSms(event.sender, event.body);
    },
  );

  // 启动竞态补发：App 被杀期间到达的短信
  SmsBridge.getPendingSms?.(
    (pending: { sender: string; body: string } | null) => {
      if (pending) {
        void useTriggerStore.getState().processSms(pending.sender, pending.body);
      }
    },
  );

  // 确保保活服务在跑
  SmsBridge.startService?.();

  initialized = true;
}

/** 查询电池白名单状态 */
export function isBatteryExempt(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!SmsBridge?.isIgnoringBatteryOptimizations) {
      resolve(false);
      return;
    }
    SmsBridge.isIgnoringBatteryOptimizations((exempt: boolean) => resolve(exempt));
  });
}

/** 请求加入电池白名单（弹系统授权框） */
export function requestBatteryExempt(): void {
  SmsBridge?.requestIgnoreBatteryOptimizations?.();
}
```

- [ ] **Step 2: 提交**

```bash
git add src/modules/trigger/services/SmsBridge.ts
git commit -m "feat: add JS SmsBridge wrapper with event listener and battery API"
```

---

### Task 7: JS 侧 Permissions 编排

**Files:**
- Create: `src/modules/trigger/services/Permissions.ts`

- [ ] **Step 1: 编写权限编排**

Write to `src/modules/trigger/services/Permissions.ts`:

```typescript
import { PermissionsAndroid, Platform } from 'react-native';
import notifee, { AuthorizationStatus } from '@notifee/react-native';
import { create } from 'zustand';
import { isBatteryExempt, requestBatteryExempt } from './SmsBridge';

interface PermissionState {
  smsGranted: boolean;
  notifyGranted: boolean;
  batteryExempt: boolean;
  /** 刷新三个权限的真实状态 */
  refresh: () => Promise<void>;
  /** 请求短信权限（返回是否授予） */
  requestSms: () => Promise<boolean>;
  /** 请求通知权限 */
  requestNotify: () => Promise<boolean>;
  /** 请求电池白名单（系统弹窗，返回是否已豁免） */
  requestBattery: () => Promise<boolean>;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  smsGranted: false,
  notifyGranted: false,
  batteryExempt: false,

  async refresh() {
    let sms = false;
    if (Platform.OS === 'android') {
      sms = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      );
    }
    const settings = await notifee.getNotificationSettings();
    const notify = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    const battery = await isBatteryExempt();
    set({ smsGranted: sms, notifyGranted: notify, batteryExempt: battery });
  },

  async requestSms() {
    if (Platform.OS !== 'android') return false;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    );
    const smsGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
    set({ smsGranted });
    return smsGranted;
  },

  async requestNotify() {
    const settings = await notifee.requestPermission();
    const notifyGranted = settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
    set({ notifyGranted });
    return notifyGranted;
  },

  async requestBattery() {
    requestBatteryExempt();
    // 等待用户操作后重查
    await new Promise((r) => setTimeout(r, 1500));
    const batteryExempt = await isBatteryExempt();
    set({ batteryExempt });
    return batteryExempt;
  },
}));
```

- [ ] **Step 2: 提交**

```bash
git add src/modules/trigger/services/Permissions.ts
git commit -m "feat: add permission orchestration store for sms/notify/battery"
```

---

### Task 8: UI 集成（权限状态条 + 启动保活）

**Files:**
- Modify: `src/modules/trigger/index.ts`
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`

- [ ] **Step 1: 模块注册时初始化 SmsBridge**

In `src/modules/trigger/index.ts`, replace content:

```typescript
import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';
import { ActionExecutor } from './services/ActionExecutor';
import { initSmsBridge } from './services/SmsBridge';

const triggerModuleConfig: ModuleConfig = {
  id: 'trigger',
  name: '短信触发器',
  homeRoute: 'TriggerRuleList',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerTriggerModule(): void {
  ActionExecutor.registerDefaults();
  if (Platform.OS === 'android') {
    initSmsBridge();
  }
  moduleRegistry.register(triggerModuleConfig);
}

export { triggerModuleConfig };
```

- [ ] **Step 2: RuleListScreen 增加权限状态条与首次请求**

In `src/modules/trigger/screens/RuleListScreen.tsx`:
- import 增加（在现有 import 后追加）：

```typescript
import { usePermissionStore } from '../services/Permissions';
```

- 组件内、`useEffect` 之前增加：

```typescript
  const { smsGranted, notifyGranted, batteryExempt, refresh, requestSms, requestNotify, requestBattery } =
    usePermissionStore();
```

- 现有 `useEffect(() => { loadRules(); }, [loadRules]);` 之后增加：

```typescript
  useEffect(() => {
    void refresh();
    void requestSms();
    void requestNotify();
  }, [refresh, requestSms, requestNotify]);
```

- 组件 return 的 `<View style={styles.container}>` 内、`<FlatList ... />` 之前插入权限状态条：

```typescript
      {(!smsGranted || !notifyGranted || !batteryExempt) && (
        <View style={styles.permissionBar}>
          {!smsGranted && (
            <Text style={styles.permissionText}>⚠️ 缺少短信权限，无法自动触发</Text>
          )}
          {!notifyGranted && (
            <Text style={styles.permissionText}>⚠️ 通知未开启，可能收不到提醒</Text>
          )}
          {!batteryExempt && (
            <TouchableOpacity onPress={() => void requestBattery()}>
              <Text style={styles.permissionAction}>🔋 允许后台运行（防清理）</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
```

- `styles` 增加：

```typescript
  permissionBar: {
    backgroundColor: '#fff8e1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ffe082',
  },
  permissionText: { fontSize: 13, color: '#b26a00', marginVertical: 2 },
  permissionAction: {
    fontSize: 13,
    color: '#4a90d9',
    fontWeight: '600',
    marginVertical: 2,
  },
```

- [ ] **Step 3: tsc 检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 报错

```bash
git add src/modules/trigger/index.ts src/modules/trigger/screens/RuleListScreen.tsx
git commit -m "feat: init sms bridge and add permission status bar to rule list"
```

---

### Task 9: 构建 + 真机验证

**Files:** None（验证步骤）

- [ ] **Step 1: 类型检查 + 单测**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc 0 报错；jest 全绿

- [ ] **Step 2: 构建安装到真机**

Run: `cd android && ./gradlew app:installDebug -PreactNativeDevServerPort=8081`
Expected: BUILD SUCCESSFUL（新增 Kotlin 编译）

- [ ] **Step 3: 验证真实短信触发（adb 模拟系统广播）**

Run:
```bash
adb shell am broadcast -a android.provider.Telephony.SMS_RECEIVED \
  --es "pdus" "dummy" 2>/dev/null; \
adb shell am broadcast -a com.flowkit.TEST_SMS --es sender "10086" --es body "未按规定停放"
```
说明：`SMS_RECEIVED` 广播需真实 PDUs 才能被系统解析，**优先用真实短信验证**（另一部手机发短信到本机，或本机 SIM 收验证码）。若只有 adb：可先用 `am broadcast` 验证 Receiver 启动链路（日志 `SmsReceiver` 打点），再安排真实短信最终验证。

- [ ] **Step 4: 被杀后仍触发**

1. 系统设置强制停止 FlowKit
2. 发真实短信（或模拟广播）
3. 预期：SmsReceiver 被唤醒 → 拉起 KeepAliveService → 4 动作触发

- [ ] **Step 5: 保活持续**

锁屏放置 30 分钟以上 → 检查：常驻通知仍在 + 发短信仍触发

- [ ] **Step 6: 开机自启（可选，耗时长）**

重启手机 → 预期：常驻通知自动出现，无需打开 App

- [ ] **Step 7: 最终提交**

```bash
git add -A
git status
git commit -m "chore: keepalive and permissions validation"
```

---

## 计划自查

**1. Spec 覆盖：**
- Manifest 权限（RECEIVE_SMS/电池/前台服务/自启）✓ Task 1
- KeepAliveService 前台服务 + 常驻通知 ✓ Task 2
- SmsReceiver 豁免广播唤醒 ✓ Task 3
- BootReceiver 开机自启 ✓ Task 4
- SmsBridgeModule 事件通道 + 电池优化 ✓ Task 5
- JS SmsBridge（事件→processSms + 竞态补发）✓ Task 6
- Permissions 编排（3 权限 + store）✓ Task 7
- UI 集成（状态条 + 首次请求 + 启动服务）✓ Task 8
- 真机验证（真实短信/被杀唤醒/保活/自启）✓ Task 9

**2. 占位符扫描：** 所有步骤含完整代码与命令，无 TBD。

**3. 类型一致性：**
- `SmsBridgeModule.NAME = "SmsBridge"`（Task 5）↔ JS `NativeModules.SmsBridge`（Task 6）✓
- 事件名 `onSmsReceived`（Task 5）↔ JS listener 同名（Task 6）✓
- `emitSms(sender, body)`（Task 5）↔ SmsReceiver 调用（Task 3）✓
- `getPendingSms(callback)` / `isIgnoringBatteryOptimizations(callback)` / `requestIgnoreBatteryOptimizations()`（Task 5）↔ JS 封装（Task 6）✓
- `usePermissionStore` 三态字段（Task 7）↔ RuleListScreen 使用（Task 8）✓
- AndroidManifest 组件注册（Task 1）与 4 个 Kotlin 类全名一致（Task 2-5）✓
