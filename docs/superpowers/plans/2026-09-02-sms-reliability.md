# 短信触发可靠性修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复一条短信响两次铃（触发链收敛）、保活通知被清空（渠道升级+诊断引导）、后台偶发失联（闹钟链自续期+精确闹钟权限）三个可靠性问题。

**Architecture:** 短信处理统一收敛到数据库链（ContentObserver + 轮询，以 `lastSmsId` 去重），广播仅负责拉起保活服务；保活通知换 `flowkit-keepalive-v2` 渠道（LOW）；保活闹钟改为接收器/服务双端自续期的永续链，并补 `SCHEDULE_EXACT_ALARM` 权限；诊断页增加通知渠道、精确闹钟、服务销毁时间三项自检。

**Tech Stack:** React Native CLI（Kotlin 原生模块）、TypeScript、Zustand。设计文档：`docs/superpowers/specs/2026-09-02-sms-reliability-design.md`

**验证命令速查：** Kotlin 编译检查 `cd android && ./gradlew compileDebugKotlin -q`（首次可能需下载依赖）；类型检查 `npx tsc --noEmit`；单测 `npx jest`。无 Android 原生单测基础设施，Kotlin 改动以编译通过 + 用户真机验证为准。

---

### Task 1: 触发去重——广播只拉服务，移除 pendingSms 补发

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/SmsReceiver.kt`（整文件重写）
- Modify: `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`（删除 pendingSms 相关）
- Modify: `src/modules/trigger/services/SmsBridge.ts`（删除补发块）

- [ ] **Step 1: 重写 SmsReceiver.kt**

删除短信解析与 `emitSms` 转发（重复触发的源头之一），只保留拉起保活服务；`startForegroundService` 包 try-catch（设计第 3 节要求，顺带完成，避免二次改动此文件）。整文件替换为：

```kotlin
package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/** 短信广播接收器：仅拉起保活服务（短信处理统一走数据库链，防双链路重复触发） */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    Log.d("SmsReceiver", "onReceive called action=${intent.action}")
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    try {
      // 拉起保活服务：短信由 ContentObserver/轮询从数据库捕获（lastSmsId 去重）
      val serviceIntent = Intent(context, KeepAliveService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        try {
          context.startForegroundService(serviceIntent)
        } catch (e: Exception) {
          Log.e("SmsReceiver", "拉起保活服务失败: ${e.message}")
        }
      } else {
        context.startService(serviceIntent)
      }
    } catch (e: Throwable) {
      Log.e("SmsReceiver", "onReceive 异常: ${e.message}", e)
    }
  }
}
```

- [ ] **Step 2: 删除 SmsBridgeModule.kt 中 pendingSms 机制**

共 4 处删除，均在该文件内：

删除 `getPendingSms` 方法（SmsBridgeModule.kt:57-70）：

```kotlin
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
```

删除 companion object 中的变量声明（SmsBridgeModule.kt:181-182）：

```kotlin
    @Volatile
    private var pendingSms: Pair<String, String>? = null
```

替换 `emitSms`（SmsBridgeModule.kt:224-228）为去掉缓存写入的版本：

```kotlin
    /** 由 checkNewSms 调用：直接发事件给 JS（App 未启动时事件丢失，由原生闭环兜底） */
    fun emitSms(sender: String, body: String) {
      instance?.sendEvent(sender, body)
    }
```

替换 `emitSmsWithLog`（SmsBridgeModule.kt:230-234）为：

```kotlin
    /** 原生已执行动作：事件携带命中信息，JS 仅记录日志 */
    private fun emitSmsWithLog(sender: String, body: String, match: SmsNativeEngine.NativeMatch) {
      instance?.sendEventWithLog(sender, body, match)
    }
```

- [ ] **Step 3: 删除 SmsBridge.ts 补发块**

替换 `initSmsBridge` 中的补发块（SmsBridge.ts:48-55）：

```typescript
  // 启动竞态补发：App 被杀期间到达的短信
  SmsBridge.getPendingSms?.(
    (pending: { sender: string; body: string } | null) => {
      if (pending) {
        void useTriggerStore.getState().processSms(pending.sender, pending.body);
      }
    },
  );
```

为空（直接删除整块）。同时更新方法头注释（SmsBridge.ts:14-15）：

```typescript
/**
 * 初始化短信桥接：注册事件监听 + 启动保活服务。
 * 在模块注册时调用一次。
```

（原第二行为「注册事件监听 + 竞态补发 + 启动保活服务」，去掉「竞态补发」四字。）

- [ ] **Step 4: 编译与类型检查**

Run: `cd android && ./gradlew compileDebugKotlin -q`
Expected: `BUILD SUCCESSFUL`

Run: `npx tsc --noEmit`（项目根目录）
Expected: 无输出（通过）

Run: `npx jest`
Expected: 全部测试通过（App.test.tsx、RuleEngine.test.ts、triggerStats.test.ts）

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/flowkit/SmsReceiver.kt android/app/src/main/java/com/flowkit/SmsBridgeModule.kt src/modules/trigger/services/SmsBridge.ts
git commit -m "fix: 短信触发收敛数据库链，修复一条短信响两次铃"
```

---

### Task 2: 通知可见性——渠道 v2（LOW）+ 诊断检测与跳转

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/KeepAliveService.kt`（渠道部分）
- Modify: `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`（诊断项 + 跳转方法）
- Modify: `src/modules/trigger/screens/DiagnosticsScreen.tsx`（UI 展示）

- [ ] **Step 1: KeepAliveService.kt 换渠道并清理旧渠道**

文件头部 import 区（现有 `import android.content.pm.ServiceInfo` 之前）无需新增 import（NotificationManager 已有）。

替换 `startForegroundCompat` 开头的渠道创建（KeepAliveService.kt:85-91）：

```kotlin
    val channelId = "flowkit-keepalive"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "FlowKit 保活", NotificationManager.IMPORTANCE_MIN)
      )
    }
```

为：

```kotlin
    // 渠道重要性创建后不可修改：换新 id 升级 MIN→LOW（LOW 有状态栏图标，MIN 会被 MIUI 收纳）
    val channelId = "flowkit-keepalive-v2"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "FlowKit 保活", NotificationManager.IMPORTANCE_LOW)
      )
      // 删除废弃旧渠道，避免系统设置页出现两个「FlowKit 保活」
      nm.deleteNotificationChannel("flowkit-keepalive")
    }
```

- [ ] **Step 2: SmsBridgeModule.kt 增加通知渠道检测与跳转**

文件 import 区（现有 `import android.os.PowerManager` 之后）新增：

```kotlin
import android.app.NotificationManager
import android.os.Build
```

在 `getDiagnostics` 方法内 `map.putMap("perms", perms)` 之前插入渠道检测（放在 perms 组装完四个权限之后）：

```kotlin
    // 保活通知渠道是否被禁用（IMPORTANCE_NONE = 用户/ROM 关闭；渠道未创建时视为正常）
    val nm = reactApplicationContext.getSystemService(NotificationManager::class.java)
    val channelEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.getNotificationChannel("flowkit-keepalive-v2")?.importance != NotificationManager.IMPORTANCE_NONE
    } else {
      true
    }
    perms.putBoolean("keepaliveChannel", channelEnabled)
```

在 `getDiagnostics` 方法之后新增跳转方法：

```kotlin
  /** 跳转系统应用通知设置页 */
  @ReactMethod
  fun openNotificationSettings() {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:${reactApplicationContext.packageName}"))
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e("SmsBridge", "跳转通知设置失败: ${e.message}")
    }
  }
```

- [ ] **Step 3: DiagnosticsScreen.tsx 展示保活通知状态**

`Diagnostics` 接口的 `perms` 增加 `keepaliveChannel`（DiagnosticsScreen.tsx:11-16 替换为）：

```tsx
  perms: {
    receiveSms: boolean;
    readSms: boolean;
    notifications: boolean;
    batteryExempt: boolean;
    keepaliveChannel: boolean;
  };
```

权限数组增加一项（DiagnosticsScreen.tsx:40-45 的 `perms` 数组末尾追加）：

```tsx
    { key: 'keepaliveChannel', label: '保活通知', ok: !!diag?.perms.keepaliveChannel },
```

权限卡片内「去系统设置 →」链接之前插入红色引导（DiagnosticsScreen.tsx:73 之前）：

```tsx
        {!diag?.perms.keepaliveChannel && (
          <TouchableOpacity onPress={() => SmsBridge?.openNotificationSettings?.()} style={{ marginTop: 8 }}>
            <Text style={{ color: '#ff6b6b', fontSize: 12 }}>⚠ 保活通知被关闭，点击去开启 →</Text>
          </TouchableOpacity>
        )}
```

- [ ] **Step 4: 编译与类型检查**

Run: `cd android && ./gradlew compileDebugKotlin -q`
Expected: `BUILD SUCCESSFUL`

Run: `npx tsc --noEmit`
Expected: 无输出（通过）

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/flowkit/KeepAliveService.kt android/app/src/main/java/com/flowkit/SmsBridgeModule.kt src/modules/trigger/screens/DiagnosticsScreen.tsx
git commit -m "fix: 保活通知换 LOW 渠道并增加诊断检测与设置跳转"
```

---

### Task 3: 保活链修复——闹钟自续期 + 精确闹钟权限 + 服务销毁记录

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `android/app/src/main/java/com/flowkit/KeepAliveService.kt`（闹钟重构）
- Modify: `android/app/src/main/java/com/flowkit/KeepAliveAlarmReceiver.kt`（自续期）
- Modify: `android/app/src/main/java/com/flowkit/BootReceiver.kt`（try-catch）
- Modify: `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`（诊断项 + 跳转）
- Modify: `src/modules/trigger/screens/DiagnosticsScreen.tsx`（UI 展示）

- [ ] **Step 1: Manifest 增加精确闹钟权限**

`AndroidManifest.xml` 权限区（`READ_CONTACTS` 行之后）新增：

```xml
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
```

- [ ] **Step 2: KeepAliveService.kt 闹钟链重构**

三处改动：

① 删除实例字段 `alarmIntervalMs` 与整个 `scheduleAlarm()` 方法（KeepAliveService.kt:22、40-61），并在文件末尾 `startForegroundCompat` 方法之后新增 companion object：

```kotlin
  companion object {
    const val ALARM_INTERVAL_MS = 30_000L

    /** 注册下一次保活闹钟（onStartCommand 与闹钟接收器共用，形成自续循环） */
    fun scheduleNextAlarm(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
      val intent = Intent(context, KeepAliveAlarmReceiver::class.java)
      val pendingIntent = PendingIntent.getBroadcast(
        context, 0, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      val triggerAt = System.currentTimeMillis() + ALARM_INTERVAL_MS
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
          // 未授权精确闹钟：降级 AllowWhileIdle（Doze 下有分钟级延迟，但链不断）
          alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        } else {
          alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }
      } catch (e: SecurityException) {
        // 个别 ROM 权限判断不标准，兜底降级
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      } catch (_: Exception) {
      }
    }
  }
```

② `onCreate` 删除 `scheduleAlarm()` 调用行（KeepAliveService.kt:69）；`onStartCommand` 改为：

```kotlin
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundCompat()
    // 每次被 start 都续期闹钟：闹钟 fire 拉起服务 → 此处再注册下一次，自续循环
    scheduleNextAlarm(this)
    return START_STICKY // 被系统回收后尝试重建
  }
```

③ `onDestroy` 改为（新增销毁时间戳，不取消闹钟）：

```kotlin
  override fun onDestroy() {
    handler.removeCallbacks(pollTask)
    // 记录销毁时间（诊断页定位被杀时机）；不取消闹钟，等它 fire 把服务拉回
    getSharedPreferences("flowkit_diag", Context.MODE_PRIVATE)
      .edit()
      .putLong("service_dead_ts", System.currentTimeMillis())
      .apply()
    super.onDestroy()
  }
```

- [ ] **Step 3: KeepAliveAlarmReceiver.kt 自续期**

整文件替换为：

```kotlin
package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 保活闹钟接收器：定时唤醒检查短信库 + 确保保活服务存活 + 自续期注册下一次闹钟。
 * 与 KeepAliveService.scheduleNextAlarm 构成永续链：任一端触发都会续期。
 */
class KeepAliveAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      // 1. 检查短信库（原生闭环触发）
      SmsBridgeModule.checkNewSms(context)
      // 2. 确保保活服务在跑（Android 12+ 后台启动 FGS 可能被系统拒绝）
      try {
        context.startForegroundService(Intent(context, KeepAliveService::class.java))
      } catch (e: Exception) {
        Log.e("KeepAliveAlarm", "拉起保活服务失败: ${e.message}")
      }
    } catch (e: Exception) {
      Log.e("KeepAliveAlarm", "闹钟处理异常: ${e.message}")
    } finally {
      // 3. 自续期：无论服务拉起成败，闹钟链不能断
      KeepAliveService.scheduleNextAlarm(context)
    }
  }
}
```

- [ ] **Step 4: BootReceiver.kt 加 try-catch**

`onReceive` 中服务启动段（BootReceiver.kt:15-20）替换为：

```kotlin
    val service = Intent(context, KeepAliveService::class.java)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(service)
      } else {
        context.startService(service)
      }
    } catch (e: Exception) {
      android.util.Log.e("BootReceiver", "拉起保活服务失败: ${e.message}")
    }
```

- [ ] **Step 5: SmsBridgeModule.kt 增加精确闹钟与服务销毁诊断**

import 区新增（Task 2 已加 `NotificationManager`、`Build`）：

```kotlin
import android.app.AlarmManager
```

`getDiagnostics` 中 `map.putInt("rulesSynced", ...)` 之后插入：

```kotlin
    // 精确闹钟授权（API 31+ 决定 Doze 下唤醒精度；低版本无此限制视为已授权）
    val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager?.canScheduleExactAlarms() == true
    map.putBoolean("canExactAlarms", canExact)
    // 上次服务销毁时间（定位被杀时机）
    map.putDouble("serviceDeadTs", prefs.getLong("service_dead_ts", -1L).toDouble())
```

`openNotificationSettings` 方法之后新增：

```kotlin
  /** 跳转精确闹钟授权页（API 31+） */
  @ReactMethod
  fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      .setData(Uri.parse("package:${reactApplicationContext.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e("SmsBridge", "跳转精确闹钟设置失败: ${e.message}")
    }
  }
```

- [ ] **Step 6: DiagnosticsScreen.tsx 展示闹钟授权与销毁时间**

`Diagnostics` 接口增加两个顶层字段（`rulesSynced` 之后）：

```tsx
  canExactAlarms: boolean;
  serviceDeadTs: number;
```

「保活服务」卡片的心跳行（DiagnosticsScreen.tsx:59）之后追加：

```tsx
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>精确闹钟（Doze 唤醒）</Text>
          <Text style={{ color: diag?.canExactAlarms ? '#22b573' : '#ff6b6b' }}>
            {diag?.canExactAlarms ? '✓ 已授权' : '✗ 未授权'}
          </Text>
        </View>
        {!diag?.canExactAlarms && (
          <TouchableOpacity onPress={() => SmsBridge?.openExactAlarmSettings?.()} style={{ marginTop: 6 }}>
            <Text style={{ color: '#4f9eff', fontSize: 12 }}>去授权精确闹钟 →</Text>
          </TouchableOpacity>
        )}
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>上次服务销毁</Text>
          <Text style={{ color: colors.textSecondary }}>
            {diag && diag.serviceDeadTs > 0 ? new Date(diag.serviceDeadTs).toLocaleString() : '无记录'}
          </Text>
        </View>
```

- [ ] **Step 7: 编译与类型检查**

Run: `cd android && ./gradlew compileDebugKotlin -q`
Expected: `BUILD SUCCESSFUL`

Run: `npx tsc --noEmit`
Expected: 无输出（通过）

Run: `npx jest`
Expected: 全部通过

- [ ] **Step 8: Commit**

```bash
git add android/app/src/main/AndroidManifest.xml android/app/src/main/java/com/flowkit/KeepAliveService.kt android/app/src/main/java/com/flowkit/KeepAliveAlarmReceiver.kt android/app/src/main/java/com/flowkit/BootReceiver.kt android/app/src/main/java/com/flowkit/SmsBridgeModule.kt src/modules/trigger/screens/DiagnosticsScreen.tsx
git commit -m "fix: 保活闹钟自续期+精确闹钟权限，修复后台失联"
```

---

### Task 4: 全量构建验证与真机验收清单

**Files:** 无代码改动（验证任务）

- [ ] **Step 1: 完整构建 Debug APK**

Run: `cd android && ./gradlew assembleDebug -q`
Expected: `BUILD SUCCESSFUL`，产物在 `android/app/build/outputs/apk/debug/app-debug.apk`

- [ ] **Step 2: 全量检查**

Run: `npx tsc --noEmit && npx jest`
Expected: 均通过

- [ ] **Step 3: 用户真机验收（小米 HyperOS，需用户手动执行）**

安装新 APK 后逐项验证：

1. **去重（核心）**：给自己发一条匹配规则的短信，锁屏听到一次铃声 → 解锁打开 App → **不再响第二次**，触发日志只有一条。
2. **不重放**：杀掉 App 再冷启动 → 不响铃、不重复记录旧短信。
3. **保活恢复**：`adb shell am kill com.flowkit`（或开发者选项里结束进程）→ 30 秒内诊断页「上次心跳」恢复到秒级、「保活服务」回到运行中。
4. **通知可见**：通知权限全开时状态栏有 FlowKit 图标、下拉栏可见「FlowKit 正在工作」；诊断页「保活通知」显示 ✓。
5. **诊断页新项**：精确闹钟显示状态（未授权点「去授权精确闹钟」能跳系统页）；「上次服务销毁」在服务被杀后出现对应时间。

- [ ] **Step 4: 推送（用户确认后）**

```bash
git push origin master
```

---

## 自审记录

- **Spec 覆盖**：设计第 1 节→Task 1；第 2 节→Task 2；第 3 节→Task 3；测试计划→各任务 Step 验证 + Task 4 验收清单。无缺口。
- **占位符扫描**：无 TBD/TODO，所有代码块完整。
- **类型一致性**：诊断字段 `canExactAlarms`/`serviceDeadTs`/`perms.keepaliveChannel` 在 Kotlin（putBoolean/putDouble）与 TS 接口（boolean/number）两侧一致；`scheduleNextAlarm` 在 KeepAliveService 定义、KeepAliveAlarmReceiver 调用一致；渠道 id `flowkit-keepalive-v2` 在 KeepAliveService 创建与 SmsBridgeModule 检测两处一致。
