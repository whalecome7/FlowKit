# 批次 1（发送人过滤 + 时间窗口）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为规则引擎增加发送人黑白名单与生效时间窗口，JS 与原生闭环双引擎同步生效。

**Architecture:** 扩展 TriggerRule 数据模型（可选字段，旧数据兼容）；RuleEngine.ts（JS）与 SmsNativeEngine.kt（Kotlin）按相同顺序（黑名单→白名单→时间窗口→conditions）匹配；规则编辑页新增两个设置区段；通讯录多选通过新原生 ContactsModule 实现。

**Tech Stack:** TypeScript / React Native 0.86 / Kotlin / Jest（@react-native/jest-preset）

---

### Task 1: 类型扩展 + RuleEngine 匹配逻辑（TDD）

**Files:**
- Modify: `src/modules/trigger/types/index.ts`
- Modify: `src/modules/trigger/services/RuleEngine.ts`
- Test: `src/modules/trigger/services/RuleEngine.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/modules/trigger/services/RuleEngine.test.ts`：

```ts
import { RuleEngine, normalizePhone, inTimeWindow } from './RuleEngine';
import type { TriggerRule } from '../types';

const baseRule: TriggerRule = {
  id: 'r1',
  name: '测试',
  enabled: true,
  conditions: [{ field: 'body', matchType: 'contains', value: '违停' }],
  actions: [{ type: 'notify', params: {} }],
  createdAt: 0,
};

describe('normalizePhone', () => {
  it('去掉 +86 前缀', () => {
    expect(normalizePhone('+8618650301429')).toBe('18650301429');
  });
  it('去掉空格和横线', () => {
    expect(normalizePhone('186 5030 1429')).toBe('18650301429');
    expect(normalizePhone('186-5030-1429')).toBe('18650301429');
  });
  it('去掉 0086 前缀', () => {
    expect(normalizePhone('008618650301429')).toBe('18650301429');
  });
});

describe('inTimeWindow', () => {
  const t = (h: number, m = 0) => new Date(2026, 7, 18, h, m);
  it('普通窗口内', () => {
    expect(inTimeWindow({ start: '08:00', end: '22:00' }, t(10))).toBe(true);
  });
  it('普通窗口外', () => {
    expect(inTimeWindow({ start: '08:00', end: '22:00' }, t(23))).toBe(false);
  });
  it('跨天窗口（22:00-08:00）夜间命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(23))).toBe(true);
  });
  it('跨天窗口（22:00-08:00）清晨命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(7))).toBe(true);
  });
  it('跨天窗口（22:00-08:00）白天不命中', () => {
    expect(inTimeWindow({ start: '22:00', end: '08:00' }, t(12))).toBe(false);
  });
});

describe('matchRule 过滤', () => {
  const sms = { sender: '18650301429', body: '您有违停记录' };
  it('黑名单命中则排除', () => {
    const rule = { ...baseRule, senderBlacklist: ['18650301429'] };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('黑名单未命中则放行', () => {
    const rule = { ...baseRule, senderBlacklist: ['10086'] };
    expect(RuleEngine.matchRule(rule, sms)).not.toBeNull();
  });
  it('白名单：不在名单则排除', () => {
    const rule = { ...baseRule, senderWhitelist: ['10086'] };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('白名单：在名单则放行（归一化匹配 +86）', () => {
    const rule = { ...baseRule, senderWhitelist: ['+86 186-5030-1429'] };
    expect(RuleEngine.matchRule(rule, sms)).not.toBeNull();
  });
  it('白名单和黑名单同时存在：白名单内且不在黑名单才放行', () => {
    const rule = {
      ...baseRule,
      senderWhitelist: ['18650301429'],
      senderBlacklist: ['18650301429'],
    };
    expect(RuleEngine.matchRule(rule, sms)).toBeNull();
  });
  it('时间窗口外完全静默', () => {
    const rule = {
      ...baseRule,
      timeWindow: { enabled: true, start: '08:00', end: '22:00' },
    };
    expect(RuleEngine.matchRule(rule, sms, new Date(2026, 7, 18, 23))).toBeNull();
  });
  it('时间窗口内正常触发', () => {
    const rule = {
      ...baseRule,
      timeWindow: { enabled: true, start: '08:00', end: '22:00' },
    };
    expect(RuleEngine.matchRule(rule, sms, new Date(2026, 7, 18, 10))).not.toBeNull();
  });
  it('旧规则无 timeWindow 字段：不限制', () => {
    expect(RuleEngine.matchRule(baseRule, sms, new Date(2026, 7, 18, 23))).not.toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/modules/trigger/services/RuleEngine.test.ts 2>&1 | tail -5`
Expected: FAIL（normalizePhone 未导出 / matchRule 无过滤逻辑）

- [ ] **Step 3: 类型扩展**

在 `src/modules/trigger/types/index.ts` 的 `TriggerRule` 接口中添加：

```ts
/** 发送人白名单（归一化精确匹配；非空时仅限名单内） */
senderWhitelist?: string[];
/** 发送人黑名单（归一化精确匹配；命中则排除） */
senderBlacklist?: string[];
/** 生效时间窗口（窗口外完全静默） */
timeWindow?: {
  enabled: boolean;
  /** 开始时间 "HH:mm" */
  start: string;
  /** 结束时间 "HH:mm" */
  end: string;
};
```

- [ ] **Step 4: 实现匹配逻辑**

在 `src/modules/trigger/services/RuleEngine.ts` 中，在文件顶部添加工具函数并修改 `matchRule`：

```ts
/** 号码归一化：去空格/横线/括号，去 +86/0086 前缀 */
export function normalizePhone(raw: string): string {
  let s = (raw ?? '').trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('+86') && s.length > 11) s = s.slice(3);
  if (s.startsWith('0086') && s.length > 11) s = s.slice(4);
  return s;
}

/** 时间窗口判断（支持跨天，start > end 表示跨天） */
export function inTimeWindow(
  window: { start: string; end: string },
  now: Date = new Date(),
): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = toMin(window.start);
  const end = toMin(window.end);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end; // 跨天
}
```

将 `matchRule` 改为：

```ts
matchRule(rule: TriggerRule, sms: SmsPayload, now: Date = new Date()): MatchResult | null {
  if (!rule.enabled || rule.conditions.length === 0) return null;

  // ① 黑名单：命中则排除
  if (
    rule.senderBlacklist?.length &&
    rule.senderBlacklist.map(normalizePhone).includes(normalizePhone(sms.sender))
  ) {
    return null;
  }
  // ② 白名单：非空时 sender 必须在名单内
  if (
    rule.senderWhitelist?.length &&
    !rule.senderWhitelist.map(normalizePhone).includes(normalizePhone(sms.sender))
  ) {
    return null;
  }
  // ③ 时间窗口：窗口外完全静默
  if (rule.timeWindow?.enabled && !inTimeWindow(rule.timeWindow, now)) {
    return null;
  }

  const matchedConditions = rule.conditions.filter((cond) =>
    matchCondition(cond, sms),
  );
  if (matchedConditions.length === rule.conditions.length) {
    return { rule, matchedConditions };
  }
  return null;
},
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest src/modules/trigger/services/RuleEngine.test.ts 2>&1 | tail -3`
Expected: PASS（全部用例通过）

- [ ] **Step 6: 提交**

```bash
git add src/modules/trigger/types/index.ts src/modules/trigger/services/RuleEngine.ts src/modules/trigger/services/RuleEngine.test.ts
git commit -m "feat: 规则引擎增加发送人黑白名单与时间窗口过滤"
```

---

### Task 2: 新规则默认时间窗口

**Files:**
- Modify: `src/modules/trigger/store/index.ts`

- [ ] **Step 1: addRule 添加默认 timeWindow**

在 `src/modules/trigger/store/index.ts` 的 `addRule` 中，创建规则时补默认值：

```ts
async addRule(input) {
  const newRule: TriggerRule = {
    ...input,
    id: generateId(),
    createdAt: Date.now(),
    // 新规则默认 08:00-22:00 生效（旧数据无此字段不受影响）
    timeWindow: { enabled: true, start: '08:00', end: '22:00' },
  };
  const rules = [...get().rules, newRule];
  await RuleStorage.saveRules(rules);
  set({ rules });
  syncRulesToNative();
},
```

- [ ] **Step 2: 编译检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add src/modules/trigger/store/index.ts
git commit -m "feat: 新规则默认启用 08:00-22:00 时间窗口"
```

---

### Task 3: 规则编辑页 UI（黑白名单 + 时间窗口）

**Files:**
- Modify: `src/modules/trigger/screens/RuleEditScreen.tsx`

- [ ] **Step 1: 查看现有结构**

Run: `grep -n "conditions\|actions\|const \[rule" src/modules/trigger/screens/RuleEditScreen.tsx | head -20`
目标：找到条件区渲染位置（在条件区结束后插入发送人过滤区），以及表单 state 结构。

- [ ] **Step 2: 扩展表单 state**

在 RuleEditScreen 的规则 state 初始化处，加入三个新字段（默认值）：

```ts
senderWhitelist: rule?.senderWhitelist ?? [],
senderBlacklist: rule?.senderBlacklist ?? [],
timeWindowEnabled: rule?.timeWindow?.enabled ?? true,
timeWindowStart: rule?.timeWindow?.start ?? '08:00',
timeWindowEnd: rule?.timeWindow?.end ?? '22:00',
```

保存时组装回 rule 对象：

```ts
senderWhitelist,
senderBlacklist,
timeWindow: { enabled: timeWindowEnabled, start: timeWindowStart, end: timeWindowEnd },
```

- [ ] **Step 3: 发送人过滤区（条件区之后插入）**

在条件区渲染结束后添加（chips + 两个入口，样式复用现有卡片风格）：

```tsx
{/* 发送人过滤 */}
<View style={cardStyle}>
  <Text style={sectionTitle}>发送人过滤</Text>
  <Text style={hint}>白名单优先，黑名单排除；号码自动归一化匹配</Text>

  {/* 白名单 */}
  <Text style={subTitle}>仅限以下发送人</Text>
  <View style={chipsWrap}>
    {senderWhitelist.map((num, i) => (
      <Chip key={i} label={num} onRemove={() => removeWhitelist(i)} />
    ))}
  </View>
  <View style={btnRow}>
    <Btn title="👤 从通讯录选择" onPress={openContactsPicker('whitelist')} />
    <Btn title="⌨ 手动输入" onPress={manualAdd('whitelist')} />
  </View>

  {/* 黑名单 */}
  <Text style={subTitle}>排除以下发送人</Text>
  <View style={chipsWrap}>
    {senderBlacklist.map((num, i) => (
      <Chip key={i} label={num} onRemove={() => removeBlacklist(i)} />
    ))}
  </View>
  <View style={btnRow}>
    <Btn title="👤 从通讯录选择" onPress={openContactsPicker('blacklist')} />
    <Btn title="⌨ 手动输入" onPress={manualAdd('blacklist')} />
  </View>
</View>
```

（`cardStyle`/`sectionTitle`/`Chip`/`Btn` 为页面内已有样式组件的复用；手动输入用 `Alert.prompt` 或页面内小弹窗。）

- [ ] **Step 4: 时间窗口区**

```tsx
{/* 生效时间窗口 */}
<View style={cardStyle}>
  <View style={rowBetween}>
    <Text style={sectionTitle}>生效时间窗口</Text>
    <Switch value={timeWindowEnabled} onValueChange={setTimeWindowEnabled} />
  </View>
  {timeWindowEnabled && (
    <View style={timeRow}>
      <TimeBox value={timeWindowStart} onPress={() => pickTime('start')} />
      <Text>→</Text>
      <TimeBox value={timeWindowEnd} onPress={() => pickTime('end')} />
    </View>
  )}
  <Text style={hint}>窗口外收到的短信完全静默 · 支持跨天（如 22:00 → 08:00）</Text>
</View>
```

`pickTime` 用 Android `TimePickerAndroid`（已废弃则用 `@react-native-community/datetimepicker`——检查项目依赖后选择；备选：自绘时分滚动选择器）。

- [ ] **Step 5: 编译检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add src/modules/trigger/screens/RuleEditScreen.tsx
git commit -m "feat: 规则编辑页新增发送人过滤与时间窗口设置"
```

---

### Task 4: 原生 ContactsModule（通讯录多选数据源）

**Files:**
- Create: `android/app/src/main/java/com/flowkit/ContactsModule.kt`
- Modify: `android/app/src/main/java/com/flowkit/MainPackage.kt`（注册模块）
- Modify: `android/app/src/main/AndroidManifest.xml`（READ_CONTACTS 权限）

- [ ] **Step 1: 声明权限**

在 `AndroidManifest.xml` `<uses-permission>` 区添加：

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

- [ ] **Step 2: 创建 ContactsModule**

创建 `android/app/src/main/java/com/flowkit/ContactsModule.kt`：

```kotlin
package com.flowkit

import android.Manifest
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.ContactsContract
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/** 通讯录查询：返回 [{ name, phones: [] }]（仅含手机号），供黑白名单多选 */
class ContactsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule() {

  override fun getName(): String = "ContactsModule"

  @ReactMethod
  fun getContacts(promise: Promise) {
    val granted = reactContext.checkSelfPermission(Manifest.permission.READ_CONTACTS) ==
      PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("PERMISSION_DENIED", "READ_CONTACTS 未授权")
      return
    }
    try {
      val results = Arguments.createArray()
      val map = LinkedHashMap<String, MutableList<String>>()
      val resolver = reactContext.contentResolver
      val cursor: Cursor? = resolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER
        ),
        null, null,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE LOCALIZED ASC"
      )
      cursor?.use { c ->
        val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        while (c.moveToNext()) {
          val name = c.getString(nameIdx) ?: ""
          val number = c.getString(numIdx) ?: ""
          if (number.isNotBlank()) {
            map.getOrPut(name) { mutableListOf() }.add(number)
          }
        }
      }
      for ((name, phones) in map) {
        val entry = Arguments.createMap()
        entry.putString("name", name)
        val arr = Arguments.createArray()
        phones.forEach { arr.pushString(it) }
        entry.putArray("phones", arr)
        results.pushMap(entry)
      }
      promise.resolve(results)
    } catch (e: Exception) {
      promise.reject("QUERY_FAILED", e.message ?: "查询通讯录失败")
    }
  }

  /** JS 请求权限后调用：请求 READ_CONTACTS 并回调结果 */
  @ReactMethod
  fun requestPermission(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity is PermissionAwareActivity) {
      activity.requestPermissions(
        arrayOf(Manifest.permission.READ_CONTACTS),
        9001,
        object : PermissionListener {
          override fun onRequestPermissionsResult(
            requestCode: Int,
            permissions: Array<out String>,
            grantResults: IntArray
          ): Boolean {
            val ok = grantResults.isNotEmpty() &&
              grantResults[0] == PackageManager.PERMISSION_GRANTED
            if (ok) promise.resolve(true) else promise.reject("DENIED", "用户拒绝")
            return true
          }
        }
      )
    } else {
      promise.reject("NO_ACTIVITY", "无 Activity 可发起权限请求")
    }
  }
}
```

- [ ] **Step 3: 注册模块**

在 `MainPackage.kt` 的 `createNativeModules` 列表中添加 `ContactsModule(reactContext)`（参照现有模块注册方式）。

- [ ] **Step 4: Kotlin 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/flowkit/ContactsModule.kt android/app/src/main/java/com/flowkit/MainPackage.kt android/app/src/main/AndroidManifest.xml
git commit -m "feat: 原生 ContactsModule 通讯录查询（黑白名单数据源）"
```

---

### Task 5: 通讯录多选 UI（JS 侧）

**Files:**
- Create: `src/modules/trigger/components/ContactsPickerModal.tsx`

- [ ] **Step 1: 创建多选弹窗组件**

创建 `src/modules/trigger/components/ContactsPickerModal.tsx`（Modal + 搜索框 + FlatList 多选 + 确定）：

```tsx
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, NativeModules } from 'react-native';
import { useState, useEffect } from 'react';

const { ContactsModule } = NativeModules;

export interface ContactEntry {
  name: string;
  phones: string[];
}

/** 通讯录多选弹窗：加载联系人、搜索、多选、返回号码列表 */
export function ContactsPickerModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (numbers: string[]) => void;
}) {
  const [contacts, setContacts] = useState<ContactEntry[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]); // 归一化号码
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected([]);
    setQuery('');
    setLoading(true);
    ContactsModule?.getContacts?.()
      .then((list: ContactEntry[]) => setContacts(list))
      .catch(() => {
        // 未授权：请求权限后重试
        ContactsModule?.requestPermission?.()
          .then(() => ContactsModule?.getContacts?.())
          .then((list: ContactEntry[]) => setContacts(list))
          .catch(() => setContacts([]));
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const norm = (n: string) => n.replace(/[\s\-()]/g, '').replace(/^\+?86/, '');
  const filtered = contacts.filter(
    (c) => !query || c.name.includes(query) || c.phones.some((p) => p.includes(query)),
  );

  const toggle = (number: string) => {
    const n = norm(number);
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n]));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', padding: 24, paddingTop: 80 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, maxHeight: '85%' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>从通讯录选择</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索姓名或号码"
            style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 10 }}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            style={{ maxHeight: 400 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => item.phones.forEach((p) => toggle(p))}
                style={{ paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eee' }}>
                <Text style={{ fontWeight: '500' }}>{item.name}</Text>
                <Text style={{ color: '#888', fontSize: 12 }}>{item.phones.join(' / ')}</Text>
              </TouchableOpacity>
            )}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose}><Text style={{ padding: 8, color: '#666' }}>取消</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { onConfirm(selected); onClose(); }}>
              <Text style={{ padding: 8, color: '#4f9eff', fontWeight: '600' }}>确定（{selected.length}）</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: 接入 RuleEditScreen**

在 RuleEditScreen 中引入组件，黑白名单两个按钮分别打开（记录当前操作目标 whitelist/blacklist），确认后合并去重追加到对应数组。

- [ ] **Step 3: 编译 + 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/modules/trigger/components/ContactsPickerModal.tsx src/modules/trigger/screens/RuleEditScreen.tsx
git commit -m "feat: 通讯录多选弹窗接入黑白名单"
```

---

### Task 6: 原生闭环引擎同步（SmsNativeEngine）

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/SmsNativeEngine.kt`

- [ ] **Step 1: 解析新字段**

在 `SmsNativeEngine.kt` 的 `setRules` 解析处，`NativeRule` 增加字段并在解析 JSON 时读取：

```kotlin
private data class NativeRule(
  val id: String,
  val name: String,
  val conditions: List<NativeCondition>,
  val actions: List<NativeAction>,
  val senderWhitelist: List<String>,   // 新增
  val senderBlacklist: List<String>,   // 新增
  val timeWindowEnabled: Boolean,      // 新增
  val timeWindowStart: String,         // 新增
  val timeWindowEnd: String,           // 新增
)
```

解析时：

```kotlin
val wl = JSONArray().let { arr ->
  obj.optJSONArray("senderWhitelist")?.let { raw ->
    for (k in 0 until raw.length()) arr.put(raw.optString(k, ""))
  }
  (0 until arr.length()).map { arr.optString(it, "") }
}
// 同理 senderBlacklist
val tw = obj.optJSONObject("timeWindow")
val twEnabled = tw?.optBoolean("enabled", false) ?: false
val twStart = tw?.optString("start", "08:00") ?: "08:00"
val twEnd = tw?.optString("end", "22:00") ?: "22:00"
```

- [ ] **Step 2: 实现归一化与过滤（与 JS 一致）**

在 `SmsNativeEngine` 中添加：

```kotlin
private fun normalizePhone(raw: String): String {
  var s = raw.trim().replace(Regex("[\\s\\-()]"), "")
  if (s.startsWith("+86") && s.length > 11) s = s.drop(3)
  if (s.startsWith("0086") && s.length > 11) s = s.drop(4)
  return s
}

private fun inTimeWindow(start: String, end: String): Boolean {
  fun toMin(t: String): Int {
    val parts = t.split(":")
    return (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
  }
  val now = Calendar.getInstance()
  val cur = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
  val s = toMin(start)
  val e = toMin(end)
  return if (s <= e) cur >= s && cur <= e else cur >= s || cur <= e
}
```

- [ ] **Step 3: handleSms 匹配时应用过滤**

在 `handleSms` 的规则过滤条件中（`snapshot.filter`），按顺序插入：

```kotlin
val matches = snapshot.filter { rule ->
  val sender = normalizePhone(senderRaw)
  // ① 黑名单
  if (rule.senderBlacklist.isNotEmpty() && rule.senderBlacklist.any { normalizePhone(it) == sender }) return@filter false
  // ② 白名单
  if (rule.senderWhitelist.isNotEmpty() && rule.senderWhitelist.none { normalizePhone(it) == sender }) return@filter false
  // ③ 时间窗口
  if (rule.timeWindowEnabled && !inTimeWindow(rule.timeWindowStart, rule.timeWindowEnd)) return@filter false
  // ④ 条件
  rule.conditions.isNotEmpty() && rule.conditions.all { matchCondition(it, senderRaw, body) }
}
```

（`senderRaw` 为原始 sender 用于条件匹配，`sender` 为归一化用于名单过滤。）

- [ ] **Step 4: Kotlin 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/flowkit/SmsNativeEngine.kt
git commit -m "feat: 原生闭环引擎同步黑白名单与时间窗口过滤"
```

---

### Task 7: 真机验证（批次 1 验收）

**Files:** 无（验证任务）

- [ ] **Step 1: 构建安装**

Run:
```bash
cd android && ./gradlew assembleRelease 2>&1 | tail -2
cd .. && cp android/app/build/outputs/apk/release/app-release.apk release/FlowKit-v1.1-release.apk
adb install -r release/FlowKit-v1.1-release.apk
```

- [ ] **Step 2: 规则配置验证（主人配合）**

1. 打开 App，编辑「违停短信监听」规则：
   - 添加白名单：从通讯录选择（验证权限申请 + 多选）
   - 添加黑名单：手动输入
   - 设置时间窗口：改为 22:00-08:00（跨天）
2. 保存后确认原生快照同步条数不变（`adb logcat | grep SmsNative` 显示"规则快照已同步"）。

- [ ] **Step 3: 触发验证（主人配合，前台 + 锁屏各一次）**

- 白名单内号码发违停短信（窗口内）→ 触发 ✅
- 黑名单号码发 → 不触发 ✅
- 白名单外号码发 → 不触发 ✅
- 窗口外（当前时间不在窗口）→ 不触发 ✅
- 锁屏重复以上 1-2 项 → 原生闭环同样遵守 ✅

- [ ] **Step 4: 记录结果**

将验证结果写入 `docs/superpowers/plans/2026-08-18-batch1-verification.md` 并提交。

---

## Self-Review

**Spec 覆盖**：发送人过滤（Task 1/3/4/5/6）✓；时间窗口（Task 1/2/3/6）✓；原生同步（Task 6）✓；验收（Task 7）✓。
**占位符**：无。
**类型一致**：`senderWhitelist`/`senderBlacklist`/`timeWindow{enabled,start,end}` 在 types/RuleEngine/store/UI/原生解析处命名一致。
