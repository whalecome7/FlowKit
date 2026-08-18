# 批次 2（自诊断页 + 触发统计报表）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增自诊断页（保活心跳/权限/规则快照/最近触发）与触发统计报表（汇总/7天分布/按规则排行）。

**Architecture:** 原生保活服务每轮询更新心跳时间戳到 SharedPreferences；SmsBridgeModule 暴露 getDiagnostics() 返回心跳/快照条数/权限状态；JS 侧两个新页面（DiagnosticsScreen / StatisticsScreen）读数据展示；统计逻辑为纯函数（stats.ts，TDD）。

**Tech Stack:** TypeScript / RN 0.86 / Kotlin / Jest

---

### Task 1: 原生诊断数据（心跳 + getDiagnostics）

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/KeepAliveService.kt`
- Modify: `android/app/src/main/java/com/flowkit/SmsBridgeModule.kt`

- [ ] **Step 1: 保活服务写心跳**

在 `KeepAliveService.kt` 的 `pollTask.run()` 中（checkNewSms 之后）添加：

```kotlin
// 心跳：写入诊断时间戳（自诊断页读取）
getSharedPreferences("flowkit_diag", Context.MODE_PRIVATE)
  .edit()
  .putLong("heartbeat_ts", System.currentTimeMillis())
  .apply()
```

- [ ] **Step 2: SmsBridgeModule 加 getDiagnostics**

在 `SmsBridgeModule.kt` 类内（`refreshWatcher` 附近）添加：

```kotlin
/** 自诊断数据：心跳时间戳 / 规则快照条数 / 权限状态 */
@ReactMethod
fun getDiagnostics(callback: Callback) {
  val prefs = reactApplicationContext.getSharedPreferences("flowkit_diag", Context.MODE_PRIVATE)
  val heartbeatTs = prefs.getLong("heartbeat_ts", -1L)
  val map = Arguments.createMap()
  map.putDouble("heartbeatTs", heartbeatTs.toDouble())
  map.putInt("rulesSynced", SmsNativeEngine.rulesCount())
  val perms = Arguments.createMap()
  perms.putBoolean(
    "receiveSms",
    reactApplicationContext.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
  )
  perms.putBoolean(
    "readSms",
    reactApplicationContext.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
  )
  perms.putBoolean(
    "notifications",
    reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
  )
  perms.putBoolean(
    "batteryExempt",
    (reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager)
      ?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) == true
  )
  map.putMap("perms", perms)
  callback.invoke(map)
}
```

（需 import `com.facebook.react.bridge.Callback`、`android.Manifest`、`android.content.pm.PackageManager`、`android.os.PowerManager`；确认文件已有 import 情况补全。）

- [ ] **Step 3: SmsNativeEngine 加 rulesCount**

在 `SmsNativeEngine.kt` 中（setRules 附近）添加：

```kotlin
/** 当前规则快照条数（自诊断页展示） */
fun rulesCount(): Int = rules.size
```

- [ ] **Step 4: 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/flowkit/
git commit -m "feat: 原生诊断数据（保活心跳/规则快照条数/权限状态）"
```

---

### Task 2: 自诊断页

**Files:**
- Create: `src/modules/trigger/screens/DiagnosticsScreen.tsx`
- Modify: `src/app/App.tsx`（路由）
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`（菜单项）

- [ ] **Step 1: 创建 DiagnosticsScreen**

创建 `src/modules/trigger/screens/DiagnosticsScreen.tsx`：

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, NativeModules, Linking } from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';

const { SmsBridge } = NativeModules;

interface Diagnostics {
  heartbeatTs: number;
  rulesSynced: number;
  perms: {
    receiveSms: boolean;
    readSms: boolean;
    notifications: boolean;
    batteryExempt: boolean;
  };
}

/** 自诊断页：保活心跳 / 权限状态 / 规则快照 / 最近触发 */
export default function DiagnosticsScreen() {
  const { colors } = useTheme();
  const { logs } = useTriggerStore();
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  const refresh = () => {
    SmsBridge?.getDiagnostics?.((d: Diagnostics) => setDiag(d));
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const heartbeatText = diag && diag.heartbeatTs > 0
    ? `${Math.max(0, Math.round((Date.now() - diag.heartbeatTs) / 1000))} 秒前`
    : '无心跳';
  const serviceRunning = !!diag && diag.heartbeatTs > 0 && Date.now() - diag.heartbeatTs < 60_000;

  const perms: { key: keyof Diagnostics['perms']; label: string; ok: boolean }[] = [
    { key: 'receiveSms', label: '短信接收', ok: !!diag?.perms.receiveSms },
    { key: 'readSms', label: '读取短信', ok: !!diag?.perms.readSms },
    { key: 'notifications', label: '通知', ok: !!diag?.perms.notifications },
    { key: 'batteryExempt', label: '电池无限制', ok: !!diag?.perms.batteryExempt },
  ];

  const latest = logs[logs.length - 1];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 保活服务 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.rowBetween}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>保活服务</Text>
          <Text style={{ color: serviceRunning ? '#22b573' : '#ff6b6b', fontWeight: '600' }}>
            {serviceRunning ? '● 运行中' : '● 已停止'}
          </Text>
        </View>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>上次心跳：{heartbeatText} · 轮询检测中</Text>
      </View>

      {/* 权限状态 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>权限状态</Text>
        <View style={styles.permGrid}>
          {perms.map((p) => (
            <View key={p.key} style={styles.permItem}>
              <Text style={{ color: colors.text }}>{p.label}</Text>
              <Text style={{ color: p.ok ? '#22b573' : '#ffb020' }}>{p.ok ? '✓ 正常' : '⚠ 未开启'}</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          style={{ marginTop: 8 }}>
          <Text style={{ color: '#4f9eff', fontSize: 12 }}>去系统设置 →</Text>
        </TouchableOpacity>
      </View>

      {/* 规则快照 + 最近触发 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: colors.text }}>原生规则快照</Text>
          <Text style={{ color: '#22b573' }}>{diag?.rulesSynced ?? 0} 条已同步</Text>
        </View>
        <View style={[styles.rowBetween, { marginTop: 10 }]}>
          <Text style={{ color: colors.text }}>最近触发</Text>
          <Text style={{ color: colors.textSecondary }}>
            {latest ? `${new Date(latest.triggeredAt).toLocaleString()} · ${latest.ruleName}` : '暂无记录'}
          </Text>
        </View>
      </View>

      <Text style={[styles.footnote, { color: colors.textSecondary }]}>
        💡 若某项异常，点击「去系统设置」直达权限设置
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, marginTop: 4 },
  permGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permItem: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.08)',
  },
  footnote: { fontSize: 12, textAlign: 'center', marginTop: 8 },
});
```

- [ ] **Step 2: 注册路由**

`src/app/App.tsx`：import DiagnosticsScreen，在 TriggerLog 之后添加：

```tsx
<Stack.Screen
  name="TriggerDiagnostics"
  component={DiagnosticsScreen}
  options={{ title: '自诊断' }}
/>
```

- [ ] **Step 3: 菜单项**

`src/modules/trigger/screens/RuleListScreen.tsx` 的 `moreItems` 数组（「触发日志」项之后）添加：

```tsx
{
  label: '自诊断',
  onPress: () => {
    setMoreVisible(false);
    navigation.navigate('TriggerDiagnostics');
  },
},
```

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误（若 logs 类型字段不符，参考 store ExecutionLog 类型调整 latest 取值）

- [ ] **Step 5: 提交**

```bash
git add src/modules/trigger/screens/DiagnosticsScreen.tsx src/app/App.tsx src/modules/trigger/screens/RuleListScreen.tsx
git commit -m "feat: 自诊断页（保活心跳/权限状态/规则快照/最近触发）"
```

---

### Task 3: 统计聚合纯函数（TDD）

**Files:**
- Create: `src/modules/trigger/services/triggerStats.ts`
- Test: `src/modules/trigger/services/triggerStats.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `src/modules/trigger/services/triggerStats.test.ts`：

```ts
import { computeStats, DAILY_KEYS } from './triggerStats';
import type { ExecutionLog } from '../types';

const now = Date.now();
const day = 24 * 3600 * 1000;

function makeLog(offsetMs: number, ruleName: string, actions: { type: string; success: boolean }[]): ExecutionLog {
  return {
    id: Math.random().toString(),
    ruleId: 'r',
    ruleName,
    smsSender: 'x',
    smsBody: 'y',
    triggeredAt: now - offsetMs,
    actions,
  };
}

describe('computeStats', () => {
  it('空日志返回零值', () => {
    const s = computeStats([], now);
    expect(s.total).toBe(0);
    expect(s.last30Days).toBe(0);
    expect(s.successRate).toBe(1);
    expect(s.byRule).toEqual([]);
  });

  it('统计总数与近30天', () => {
    const logs = [
      makeLog(1 * day, 'A', []),
      makeLog(10 * day, 'A', []),
      makeLog(40 * day, 'B', []),
    ];
    const s = computeStats(logs, now);
    expect(s.total).toBe(3);
    expect(s.last30Days).toBe(2);
  });

  it('动作成功率（成功/总数，空动作按成功计）', () => {
    const logs = [
      makeLog(1 * day, 'A', [{ type: 'vibrate', success: true }, { type: 'ringtone', success: true }]),
      makeLog(2 * day, 'A', [{ type: 'vibrate', success: false }]),
    ];
    const s = computeStats(logs, now);
    expect(s.successRate).toBeCloseTo(2 / 3);
  });

  it('近7天分布键齐全且计数正确', () => {
    const logs = [
      makeLog(0.5 * day, 'A', []), // 今天
      makeLog(2 * day, 'B', []), // 2 天前
      makeLog(8 * day, 'C', []), // 8 天前（不在此列）
    ];
    const s = computeStats(logs, now);
    expect(s.daily.length).toBe(7);
    expect(s.daily[0].count).toBe(1); // 今天
    expect(s.daily[2].count).toBe(1); // 2 天前
    expect(s.daily.reduce((a, b) => a + b.count, 0)).toBe(2);
  });

  it('按规则排行（降序）', () => {
    const logs = [
      makeLog(1 * day, 'A', []),
      makeLog(2 * day, 'B', []),
      makeLog(3 * day, 'B', []),
      makeLog(4 * day, 'B', []),
    ];
    const s = computeStats(logs, now);
    expect(s.byRule[0]).toEqual({ name: 'B', count: 3 });
    expect(s.byRule[1]).toEqual({ name: 'A', count: 1 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest src/modules/trigger/services/triggerStats.test.ts 2>&1 | tail -3`
Expected: FAIL（module not found）

- [ ] **Step 3: 实现**

创建 `src/modules/trigger/services/triggerStats.ts`：

```ts
import type { ExecutionLog } from '../types';

export const DAILY_KEYS = ['一', '二', '三', '四', '五', '六', '日'];

export interface RuleCount {
  name: string;
  count: number;
}

export interface StatsResult {
  total: number;
  last30Days: number;
  successRate: number;
  daily: { key: string; count: number }[];
  byRule: RuleCount[];
}

/** 从触发日志聚合统计（纯函数） */
export function computeStats(logs: ExecutionLog[], now: number = Date.now()): StatsResult {
  const total = logs.length;
  const last30Days = logs.filter((l) => now - l.triggeredAt <= 30 * 24 * 3600 * 1000).length;

  // 动作成功率：成功动作数 / 总动作数；无动作的触发按成功计 1
  let actionTotal = 0;
  let actionOk = 0;
  for (const l of logs) {
    if (l.actions.length === 0) {
      actionTotal += 1;
      actionOk += 1;
    } else {
      actionTotal += l.actions.length;
      actionOk += l.actions.filter((a) => a.success).length;
    }
  }
  const successRate = actionTotal === 0 ? 1 : actionOk / actionTotal;

  // 近 7 天分布（今天为 daily[0]）
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startTs = startOfToday.getTime();
  const daily = DAILY_KEYS.map((key, i) => {
    const dayStart = startTs - i * 24 * 3600 * 1000;
    const dayEnd = dayStart + 24 * 3600 * 1000;
    return {
      key,
      count: logs.filter((l) => l.triggeredAt >= dayStart && l.triggeredAt < dayEnd).length,
    };
  });

  // 按规则排行（降序）
  const ruleMap = new Map<string, number>();
  for (const l of logs) {
    ruleMap.set(l.ruleName, (ruleMap.get(l.ruleName) ?? 0) + 1);
  }
  const byRule = [...ruleMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return { total, last30Days, successRate, daily, byRule };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest src/modules/trigger/services/triggerStats.test.ts 2>&1 | tail -3`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/modules/trigger/services/triggerStats.ts src/modules/trigger/services/triggerStats.test.ts
git commit -m "feat: 触发统计聚合纯函数（TDD）"
```

---

### Task 4: 统计报表页

**Files:**
- Create: `src/modules/trigger/screens/StatisticsScreen.tsx`
- Modify: `src/app/App.tsx`（路由）
- Modify: `src/modules/trigger/screens/RuleListScreen.tsx`（菜单项）

- [ ] **Step 1: 创建 StatisticsScreen**

创建 `src/modules/trigger/screens/StatisticsScreen.tsx`（自绘柱状图，无第三方库）：

```tsx
import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import { computeStats } from '../services/triggerStats';

/** 触发统计报表：汇总 / 7天分布柱状图 / 按规则排行 */
export default function StatisticsScreen() {
  const { colors } = useTheme();
  const { logs } = useTriggerStore();
  const stats = useMemo(() => computeStats(logs), [logs]);

  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.count));
  const maxRule = Math.max(1, ...stats.byRule.map((r) => r.count));

  const summary = [
    { label: '总触发', value: String(stats.total) },
    { label: '近 30 天', value: String(stats.last30Days) },
    { label: '动作成功率', value: `${Math.round(stats.successRate * 100)}%` },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 汇总 */}
      <View style={styles.summaryRow}>
        {summary.map((s) => (
          <View key={s.label} style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* 7 天分布 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>近 7 天分布</Text>
        <View style={styles.chart}>
          {stats.daily.map((d, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(4, (d.count / maxDaily) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{d.key}</Text>
              <Text style={[styles.barCount, { color: colors.textSecondary }]}>{d.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 按规则 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>按规则</Text>
        {stats.byRule.length === 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>暂无触发记录</Text>
        )}
        {stats.byRule.map((r) => (
          <View key={r.name} style={styles.ruleRow}>
            <Text style={{ color: colors.text, flex: 1 }}>{r.name}</Text>
            <View style={styles.ruleBarTrack}>
              <View style={[styles.ruleBar, { width: `${(r.count / maxRule) * 100}%` }]} />
            </View>
            <Text style={{ color: colors.textSecondary, marginLeft: 8, width: 36, textAlign: 'right' }}>
              {r.count}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 6 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: '#4f9eff', borderRadius: 4, width: '70%', alignSelf: 'center' },
  barLabel: { fontSize: 10, marginTop: 4 },
  barCount: { fontSize: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  ruleBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 4, overflow: 'hidden', marginLeft: 8 },
  ruleBar: { height: 8, backgroundColor: '#4f9eff', borderRadius: 4 },
});
```

- [ ] **Step 2: 路由 + 菜单**

`src/app/App.tsx`：import StatisticsScreen，添加：

```tsx
<Stack.Screen
  name="TriggerStatistics"
  component={StatisticsScreen}
  options={{ title: '触发统计' }}
/>
```

`RuleListScreen.tsx` 菜单（「自诊断」后）添加：

```tsx
{
  label: '触发统计',
  onPress: () => {
    setMoreVisible(false);
    navigation.navigate('TriggerStatistics');
  },
},
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add src/modules/trigger/screens/StatisticsScreen.tsx src/app/App.tsx src/modules/trigger/screens/RuleListScreen.tsx
git commit -m "feat: 触发统计报表页（汇总/7天分布/按规则排行）"
```

---

### Task 5: 真机验收

**Files:** 无

- [ ] **Step 1: 构建安装**

```bash
cd android && ./gradlew assembleRelease 2>&1 | tail -2
cd .. && cp android/app/build/outputs/apk/release/app-release.apk release/FlowKit-v1.1-release.apk
adb install -r release/FlowKit-v1.1-release.apk
```

- [ ] **Step 2: 主人验收（手动）**

1. 打开 App → ⋯ → 自诊断：确认保活服务「运行中」+ 心跳 N 秒前、4 项权限状态、规则快照条数、最近触发
2. ⋯ → 触发统计：汇总卡数值与触发日志一致、7 天柱状图渲染、按规则排行正确
3. 触发一条短信后回统计页，数值应 +1

- [ ] **Step 3: 记录结果并提交验证文档（简化：追加到计划同目录 verification 文件或直接记录）**

---

## Self-Review

**Spec 覆盖**：自诊断（Task 1/2）✓；统计（Task 3/4）✓；验收（Task 5）✓。
**占位符**：无。
**类型一致**：getDiagnostics 返回字段（heartbeatTs/rulesSynced/perms）、computeStats 返回（total/last30Days/successRate/daily/byRule）在 Task 间一致。
