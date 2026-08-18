# 反应力测试小游戏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首页新增「⚡ 反应力测试」模块（经典/序列/追踪三模式），原生闭环计时（误差 ≤16ms）。

**Architecture:** 原生自定义组件 SignalAreaView（ReactViewManager，Fabric interop）负责信号显示与触摸计时（t0=原生变色+uptimeMillis，t1=MotionEvent.eventTime，同源时钟）；JS 负责模式选择页/游戏页壳/结果页；结果按模式存 AsyncStorage 历史最佳。

**Tech Stack:** Kotlin / RN 0.86（newArch，legacy interop）/ TypeScript

**注意**：RN 0.86 Fabric 下 legacy ViewManager 走 interop（现有 legacy NativeModule 已验证可用）。若 SignalAreaViewManager interop 异常（编译/运行报 UIManager 相关错），fallback：ReactionModule（NativeModule）管理 SignalAreaView 并 addView 到 Activity DecorView（覆盖层），JS 只调 start/stop/收事件——两方案接口一致（JS 侧封装统一）。

---

### Task 1: 原生 SignalAreaView + SignalAreaViewManager

**Files:**
- Create: `android/app/src/main/java/com/flowkit/SignalAreaView.kt`
- Create: `android/app/src/main/java/com/flowkit/SignalAreaViewManager.kt`
- Modify: `android/app/src/main/java/com/flowkit/FlowKitPackage.kt`（注册 view manager）

- [ ] **Step 1: 创建 SignalAreaView.kt**

```kotlin
package com.flowkit

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.random.Random

/**
 * 反应力测试信号区（原生组件）：
 * - 三模式：REACTION（全屏色块红→绿）/ SEQUENCE（2×2 高亮格）/ TRACKING（目标跳位）
 * - 计时闭环：t0=原生变色时刻(uptimeMillis)，t1=MotionEvent.eventTime，同源时钟
 * - 状态机：IDLE → WAITING（随机延迟）→ READY（信号出现+t0）→ 触摸后 DONE/FAULT
 */
class SignalAreaView(context: Context) : View(context) {

  companion object {
    const val MODE_REACTION = "reaction"
    const val MODE_SEQUENCE = "sequence"
    const val MODE_TRACKING = "tracking"

    const val COLOR_WAIT = 0xFF8D8D8D.toInt()
    const val COLOR_READY = 0xFF30A46C.toInt()
    const val COLOR_FAULT = 0xFFE5484D.toInt()
    const val COLOR_BG = 0xFF1A1A1A.toInt()
    const val COLOR_CELL_BORDER = 0xFF333333.toInt()
  }

  enum class Phase { IDLE, WAITING, READY, DONE, FAULT }

  private val handler = Handler(Looper.getMainLooper())
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  @Volatile private var mode = MODE_REACTION
  @Volatile var phase: Phase = Phase.IDLE
    private set
  private var t0 = 0L
  private var highlightIndex = 0      // SEQUENCE 高亮格（0-3）
  private var targetX = 0f             // TRACKING 目标圆心
  private var targetY = 0f
  private var targetRadius = 0f
  private var faultRounds = 0

  private val randomDelay = { Random.nextLong(2000L, 5000L) }

  private val readyRunnable = Runnable {
    phase = Phase.READY
    t0 = SystemClock.uptimeMillis()
    invalidate()
  }

  /** JS 设置模式（游戏开始前） */
  fun setMode(newMode: String) {
    mode = newMode
    phase = Phase.IDLE
    handler.removeCallbacksAndMessages(null)
    invalidate()
  }

  /** JS 开始一轮：进入等待，随机延迟后变信号 */
  fun startRound() {
    if (phase == Phase.READY || phase == Phase.WAITING) return
    phase = Phase.WAITING
    invalidate()
    handler.removeCallbacks(readyRunnable)
    handler.postDelayed(readyRunnable, randomDelay())
  }

  /** 停止/重置 */
  fun stop() {
    handler.removeCallbacksAndMessages(null)
    phase = Phase.IDLE
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    // TRACKING 目标初始随机位置
    targetRadius = minOf(w, h) * 0.09f
    randomizeTarget()
  }

  private fun randomizeTarget() {
    val r = targetRadius
    targetX = r + Random.nextFloat() * (width - 2 * r)
    targetY = r + Random.nextFloat() * (height - 2 * r)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    when (mode) {
      MODE_REACTION -> drawReaction(canvas)
      MODE_SEQUENCE -> drawSequence(canvas)
      MODE_TRACKING -> drawTracking(canvas)
    }
  }

  private fun drawReaction(canvas: Canvas) {
    canvas.drawColor(
      when (phase) {
        Phase.READY -> COLOR_READY
        Phase.FAULT -> COLOR_FAULT
        Phase.WAITING, Phase.DONE, Phase.IDLE -> COLOR_WAIT
      }
    )
  }

  private fun drawSequence(canvas: Canvas) {
    canvas.drawColor(COLOR_BG)
    val gap = (minOf(width, height) * 0.03f).toInt()
    val cw = (width - gap * 3) / 2
    val ch = (height - gap * 3) / 2
    paint.color = COLOR_CELL_BORDER
    for (i in 0 until 4) {
      val row = i / 2
      val col = i % 2
      val l = gap + col * (cw + gap)
      val t = gap + row * (ch + gap)
      val isHighlight =
        phase == Phase.READY && i == highlightIndex
      paint.color = if (isHighlight) COLOR_READY else COLOR_WAIT
      canvas.drawRect(l.toFloat(), t.toFloat(), (l + cw).toFloat(), (t + ch).toFloat(), paint)
    }
  }

  private fun drawTracking(canvas: Canvas) {
    canvas.drawColor(COLOR_BG)
    paint.color = COLOR_READY
    canvas.drawCircle(targetX, targetY, targetRadius, paint)
    paint.color = Color.WHITE
    paint.textSize = targetRadius * 0.8f
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText("点击", targetX, targetY + targetRadius * 0.28f, paint)
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action != MotionEvent.ACTION_DOWN) return true
    when (phase) {
      Phase.WAITING -> {
        // 过早点击 = 失误
        phase = Phase.FAULT
        invalidate()
        emitResult(0L, true)
      }
      Phase.READY -> {
        val dt = event.eventTime - t0
        val ok = when (mode) {
          MODE_SEQUENCE -> hitSequence(event.x, event.y)
          MODE_TRACKING -> hitTarget(event.x, event.y)
          else -> true
        }
        if (!ok) {
          phase = Phase.FAULT
          invalidate()
          emitResult(dt, true)
        } else {
          phase = Phase.DONE
          invalidate()
          emitResult(dt, false)
        }
      }
      else -> Unit
    }
    return true
  }

  private fun hitSequence(x: Float, y: Float): Boolean {
    val gap = (minOf(width, height) * 0.03f).toInt()
    val cw = (width - gap * 3) / 2
    val ch = (height - gap * 3) / 2
    val row = highlightIndex / 2
    val col = highlightIndex % 2
    val l = gap + col * (cw + gap)
    val t = gap + row * (ch + gap)
    return x >= l && x <= l + cw && y >= t && y <= t + ch
  }

  private fun hitTarget(x: Float, y: Float): Boolean {
    val dx = x - targetX
    val dy = y - targetY
    return dx * dx + dy * dy <= targetRadius * targetRadius * 1.2f
  }

  /** 下一轮准备（JS 每轮后调用） */
  fun prepareNextRound(highlightSeed: Int, targetSeedX: Float, targetSeedY: Float) {
    highlightIndex = highlightSeed % 4
    targetX = targetSeedX
    targetY = targetSeedY
    phase = Phase.IDLE
    invalidate()
  }

  /** 原生随机准备下一轮（JS 不参与随机，减少延迟） */
  fun prepareNextRoundAuto() {
    if (mode == MODE_SEQUENCE) highlightIndex = Random.nextInt(4)
    if (mode == MODE_TRACKING) randomizeTarget()
    phase = Phase.IDLE
    invalidate()
  }

  private fun emitResult(timeMs: Long, isFault: Boolean) {
    val ctx = context
    if (ctx !is ReactContext || id == View.NO_ID) return
    val map: WritableMap = Arguments.createMap()
    map.putDouble("timeMs", timeMs.toDouble())
    map.putBoolean("isFault", isFault)
    ctx.getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "onRoundResult", map)
  }
}
```

- [ ] **Step 2: 创建 SignalAreaViewManager.kt**

```kotlin
package com.flowkit

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/** 信号区原生组件管理器（legacy interop：Fabric 下自动兼容） */
class SignalAreaViewManager : SimpleViewManager<SignalAreaView>() {

  override fun getName(): String = "SignalAreaView"

  override fun createViewInstance(reactContext: ThemedReactContext): SignalAreaView =
    SignalAreaView(reactContext)

  @ReactProp(name = "mode")
  fun setMode(view: SignalAreaView, mode: String?) {
    view.setMode(mode ?: SignalAreaView.MODE_REACTION)
  }

  @ReactProp(name = "running")
  fun setRunning(view: SignalAreaView, running: Boolean) {
    if (running) view.startRound() else view.stop()
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "onRoundResult" to mapOf("registrationName" to "onRoundResult")
    )
  }
}
```

- [ ] **Step 3: 注册 ViewManager**

`FlowKitPackage.kt` 中 override `createViewManagers`：

```kotlin
override fun createViewManagers(
  reactContext: ReactApplicationContext
): MutableList<ViewManager<*, *>> {
  return mutableListOf(SignalAreaViewManager())
}
```

（import `com.facebook.react.uimanager.ViewManager`；确认现有 FlowKitPackage 结构，若实现 `ReactPackage` 接口则添加该方法。）

- [ ] **Step 4: 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 5: 提交**

```bash
git add android/app/src/main/java/com/flowkit/SignalAreaView.kt android/app/src/main/java/com/flowkit/SignalAreaViewManager.kt android/app/src/main/java/com/flowkit/FlowKitPackage.kt
git commit -m "feat: 原生信号区组件（三模式绘制+触摸闭环计时）"
```

---

### Task 2: reaction 模块骨架（注册 + 路由）

**Files:**
- Create: `src/modules/reaction/index.ts`
- Modify: `src/app/App.tsx`（路由 + 模块注册调用）
- Modify: `src/app/HomeScreen.tsx`（如需显式注册模块——确认模块注册机制：现有 trigger 模块在 App.tsx 注册？）

- [ ] **Step 1: 确认模块注册方式**

Run: `grep -rn "registerTriggerModule\|register.*Module" src/app/App.tsx src/app/index.tsx src/index.ts 2>/dev/null | head -5`
找到现有模块注册入口（trigger 怎么注册的），按同样方式注册 reaction 模块。

- [ ] **Step 2: 创建模块入口**

创建 `src/modules/reaction/index.ts`：

```ts
import { Platform } from 'react-native';
import { moduleRegistry } from '../../app/module-registry';
import type { ModuleConfig } from '../../app/types';

const reactionModuleConfig: ModuleConfig = {
  id: 'reaction',
  name: '反应力测试',
  homeRoute: 'ReactionHome',
  enabled: Platform.OS === 'android',
  getRoutes: () => [],
};

export function registerReactionModule(): void {
  moduleRegistry.register(reactionModuleConfig);
}

export { reactionModuleConfig };
```

（参照 `src/modules/trigger/index.ts` 的结构与 `ModuleConfig` 类型字段。）

- [ ] **Step 3: 注册路由与模块**

在 App.tsx（或模块注册入口）：
- 调用 `registerReactionModule()`
- 添加路由（React 组件在后续 Task 3/4/5 创建，本任务可先注册占位或随 Task 一起——**建议：本任务只注册模块 config + import 入口，路由在 Task 3-5 各页面创建后添加**）

- [ ] **Step 4: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add src/modules/reaction/index.ts src/app/App.tsx
git commit -m "feat: reaction 模块骨架注册"
```

---

### Task 3: 模式选择页 ReactionHome

**Files:**
- Create: `src/modules/reaction/screens/ReactionHome.tsx`
- Modify: `src/app/App.tsx`（路由 ReactionHome）

- [ ] **Step 1: 创建模式选择页**

```tsx
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../theme';

const MODES = [
  { key: 'reaction', icon: '⚡', title: '经典反应', desc: '等信号变绿，最快点击', tip: '最基础的反应力' },
  { key: 'sequence', icon: '🎯', title: '序列反应', desc: '2×2 四格，随机一格高亮，点对应格', tip: '反应 + 视觉定位' },
  { key: 'tracking', icon: '🎮', title: '追踪反应', desc: '目标随机跳位，点击命中', tip: '反应 + 瞄准' },
] as const;

type ModeKey = (typeof MODES)[number]['key'];

/** 反应力测试：模式选择 */
export default function ReactionHome() {
  const { colors } = useTheme();
  const navigation = useNavigation();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>⚡ 反应力测试</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        原生级计时，结果最接近真实 · 每个模式 5 轮
      </Text>
      {MODES.map((m) => (
        <TouchableOpacity
          key={m.key}
          onPress={() => navigation.navigate('ReactionGame', { mode: m.key })}
          style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.icon}>{m.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{m.desc}</Text>
            <Text style={[styles.cardTip, { color: colors.textMuted }]}>{m.tip}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 12 },
  icon: { fontSize: 32, marginRight: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDesc: { fontSize: 13, marginTop: 2 },
  cardTip: { fontSize: 12, marginTop: 4 },
});
```

- [ ] **Step 2: App.tsx 路由**

import ReactionHome，添加：

```tsx
<Stack.Screen name="ReactionHome" component={ReactionHome} options={{ title: '反应力测试' }} />
```

- [ ] **Step 3: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Commit: `git add src/modules/reaction/screens/ReactionHome.tsx src/app/App.tsx && git commit -m "feat: 反应力测试模式选择页"`

---

### Task 4: 游戏页 ReactionGame

**Files:**
- Create: `src/modules/reaction/screens/ReactionGame.tsx`
- Modify: `src/app/App.tsx`（路由 ReactionGame）

- [ ] **Step 1: 创建游戏页**

```tsx
import { useRef, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, NativeModules,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTheme } from '../../../theme';
import { requireNativeComponent } from 'react-native';

// 原生信号区组件（Fabric interop）
const SignalAreaNative = requireNativeComponent('SignalAreaView');

type Mode = 'reaction' | 'sequence' | 'tracking';

interface RoundResult {
  timeMs: number;
  isFault: boolean;
}

const TOTAL_ROUNDS = 5;

const MODE_LABEL: Record<Mode, string> = {
  reaction: '经典反应',
  sequence: '序列反应',
  tracking: '追踪反应',
};

/** 反应力测试：游戏页（5 轮，原生计时） */
export default function ReactionGame() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<{ params: { mode: Mode } }, 'params'>>();
  const navigation = useNavigation();
  const mode = route.params?.mode ?? 'reaction';

  const [round, setRound] = useState(0);        // 已完成轮数
  const [phase, setPhase] = useState<'idle' | 'running'>('idle');
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const resultsRef = useRef<RoundResult[]>([]);
  const runningRef = useRef(false);

  const startRound = () => {
    setPhase('running');
    setLastResult(null);
    runningRef.current = true;
  };

  const onRoundResult = (e: { nativeEvent: RoundResult }) => {
    const r = e.nativeEvent;
    resultsRef.current = [...resultsRef.current, r];
    setLastResult(r);
    const done = resultsRef.current.length;
    setRound(done);
    runningRef.current = false;
    if (done >= TOTAL_ROUNDS) {
      // 全部完成 → 结果页
      navigation.navigate('ReactionResult', {
        mode,
        results: resultsRef.current,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部状态区 */}
      <View style={styles.statusBar}>
        <Text style={[styles.modeLabel, { color: colors.text }]}>{MODE_LABEL[mode]}</Text>
        <Text style={[styles.roundText, { color: colors.textSecondary }]}>
          第 {Math.min(round + 1, TOTAL_ROUNDS)} / {TOTAL_ROUNDS} 轮
        </Text>
        {lastResult && (
          <Text style={[styles.resultText, { color: lastResult.isFault ? '#E5484D' : '#30A46C' }]}>
            {lastResult.isFault ? '失误！' : `${lastResult.timeMs} ms`}
          </Text>
        )}
      </View>

      {/* 信号区（原生） */}
      <View style={styles.signalWrap}>
        <SignalAreaNative
          style={{ flex: 1 }}
          mode={mode}
          running={phase === 'running'}
          onRoundResult={onRoundResult}
        />
      </View>

      {/* 底部控制区 */}
      <View style={styles.controlBar}>
        {phase === 'idle' ? (
          <TouchableOpacity
            onPress={startRound}
            style={[styles.btn, { backgroundColor: '#30A46C' }]}>
            <Text style={styles.btnText}>
              {round === 0 ? '开始测试' : '下一轮'}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {round >= TOTAL_ROUNDS ? '计算成绩…' : '等待信号…'}
          </Text>
        )}
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Text style={{ color: colors.textSecondary }}>退出</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: { padding: 12, paddingTop: 8, alignItems: 'center', gap: 2 },
  modeLabel: { fontSize: 16, fontWeight: '600' },
  roundText: { fontSize: 13 },
  resultText: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  signalWrap: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden' },
  controlBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, gap: 16,
  },
  btn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

**关键**：`SignalAreaNative` 的 `running` prop 在 React 中每次 setPhase('running') 会传 true 触发原生 startRound；`onRoundResult` 原生回调。**注意**：running prop 只在新值变化时触发（React 对相同 boolean 不重渲染）——`startRound` 里 `setPhase('running')` 且上一轮后 phase 已是 'idle'（onRoundResult 里未 setPhase('idle')？——需要：onRoundResult 后 setPhase('idle') 使下次 running 从 false→true 触发）。**修正**：onRoundResult 里 `setPhase('idle')`。

- [ ] **Step 2: App.tsx 路由**

```tsx
<Stack.Screen name="ReactionGame" component={ReactionGame} options={{ title: '反应力测试' }} />
```

- [ ] **Step 3: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Commit: `git add src/modules/reaction/screens/ReactionGame.tsx src/app/App.tsx && git commit -m "feat: 反应力测试游戏页（原生信号区+5轮）"`

---

### Task 5: 结果页 ReactionResult

**Files:**
- Create: `src/modules/reaction/screens/ReactionResult.tsx`
- Create: `src/modules/reaction/services/bestStore.ts`
- Modify: `src/app/App.tsx`（路由）

- [ ] **Step 1: 历史最佳存储**

创建 `src/modules/reaction/services/bestStore.ts`：

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const key = (mode: string) => `@flowkit:reaction:best:${mode}`;

/** 读取本模式历史最佳（最快毫秒），无则 null */
export async function loadBest(mode: string): Promise<number | null> {
  const raw = await AsyncStorage.getItem(key(mode));
  const v = raw ? Number(raw) : 0;
  return v > 0 ? v : null;
}

/** 更新历史最佳，返回是否刷新记录 */
export async function updateBest(mode: string, timeMs: number): Promise<boolean> {
  const prev = await loadBest(mode);
  if (prev !== null && prev <= timeMs) return false;
  await AsyncStorage.setItem(key(mode), String(timeMs));
  return true;
}
```

- [ ] **Step 2: 创建结果页**

```tsx
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTheme } from '../../../theme';
import { loadBest, updateBest } from '../services/bestStore';

type Mode = 'reaction' | 'sequence' | 'tracking';

interface RoundResult {
  timeMs: number;
  isFault: boolean;
}

const MODE_LABEL: Record<Mode, string> = {
  reaction: '经典反应', sequence: '序列反应', tracking: '追踪反应',
};

function rating(avg: number): { label: string; color: string } {
  if (avg < 200) return { label: '🏆 优秀', color: '#30A46C' };
  if (avg < 280) return { label: '👍 良好', color: '#4f9eff' };
  if (avg < 380) return { label: '😐 一般', color: '#ffb020' };
  return { label: '💪 需练习', color: '#E5484D' };
}

/** 反应力测试：结果页 */
export default function ReactionResult() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<{ params: { mode: Mode; results: RoundResult[] } }, 'params'>>();
  const navigation = useNavigation();
  const { mode, results } = route.params ?? { mode: 'reaction' as Mode, results: [] as RoundResult[] };

  const [best, setBest] = useState<number | null>(null);
  const [isRecord, setIsRecord] = useState(false);

  useEffect(() => {
    const valid = results.filter((r) => !r.isFault);
    if (valid.length === 0) return;
    const fastest = Math.min(...valid.map((r) => r.timeMs));
    void updateBest(mode, fastest).then((rec) => {
      setIsRecord(rec);
      return loadBest(mode);
    }).then(setBest);
  }, []);

  const valid = results.filter((r) => !r.isFault);
  const faults = results.filter((r) => r.isFault).length;
  const avg = valid.length > 0
    ? Math.round(valid.reduce((a, r) => a + r.timeMs, 0) / valid.length)
    : 0;
  const fastest = valid.length > 0 ? Math.min(...valid.map((r) => r.timeMs)) : 0;
  const slowest = valid.length > 0 ? Math.max(...valid.map((r) => r.timeMs)) : 0;
  const rate = rating(avg);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>测试完成</Text>
      <Text style={[styles.mode, { color: colors.textSecondary }]}>{MODE_LABEL[mode]}</Text>

      {isRecord && (
        <Text style={styles.record}>🎉 新纪录！</Text>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.ratingRow}>
          <Text style={[styles.rating, { color: rate.color }]}>{rate.label}</Text>
          <Text style={[styles.avg, { color: colors.text }]}>{avg} ms</Text>
        </View>
        <View style={styles.stats}>
          <Stat label="最快" value={`${fastest} ms`} colors={colors} />
          <Stat label="最慢" value={`${slowest} ms`} colors={colors} />
          <Stat label="失误" value={`${faults} 次`} colors={colors} />
          <Stat label="历史最佳" value={best ? `${best} ms` : '—'} colors={colors} />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => navigation.replace('ReactionGame', { mode })}
        style={[styles.btn, { backgroundColor: '#30A46C' }]}>
        <Text style={styles.btnText}>再玩一次</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.popToTop()}
        style={{ padding: 12 }}>
        <Text style={{ color: colors.textSecondary }}>返回模式选择</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 24 },
  mode: { fontSize: 14, marginTop: 4 },
  record: { color: '#ffb020', fontSize: 16, fontWeight: '700', marginTop: 8 },
  card: { borderRadius: 16, padding: 20, width: '100%', marginTop: 20, alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  rating: { fontSize: 24, fontWeight: '700' },
  avg: { fontSize: 20, fontWeight: '700' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, width: '100%' },
  stat: { width: '47%', backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 10, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  btn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24, marginTop: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 3: App.tsx 路由**

```tsx
<Stack.Screen name="ReactionResult" component={ReactionResult} options={{ title: '测试结果' }} />
```

- [ ] **Step 4: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Commit: `git add src/modules/reaction/ src/app/App.tsx && git commit -m "feat: 反应力测试结果页（统计+评级+历史最佳）"`

---

### Task 6: 真机验收

**Files:** 无

- [ ] **Step 1: 构建安装**

```bash
cd android && ./gradlew assembleRelease 2>&1 | tail -2
cd .. && cp android/app/build/outputs/apk/release/app-release.apk release/FlowKit-v1.1-release.apk
adb install -r release/FlowKit-v1.1-release.apk
```

- [ ] **Step 2: 主人验收（手动）**

1. 首页出现「⚡ 反应力测试」卡片 → 进入 → 模式选择页 3 卡片
2. 经典模式：变绿点击，5 轮后结果页（平均/最快/最慢/失误/评级/历史最佳）
3. 序列模式：2×2 格高亮点对应格，点错记失误
4. 追踪模式：目标跳位点击，点空记失误
5. **计时准确性**：与手机秒表/网上标准反应测试对比，多次平均值应接近（误差 ≤30ms）
6. 再次游玩，历史最佳更新；刷新记录显示「新纪录！」
7. 返回/退出导航正常

- [ ] **Step 3: 记录结果并提交**

---

## Self-Review

**Spec 覆盖**：原生计时（Task 1）✓；模块/路由（Task 2/3/4/5）✓；三模式（Task 1 原生 + Task 4 壳）✓；5 轮（Task 4）✓；结果页+评级+历史最佳（Task 5）✓；验收（Task 6）✓。
**占位符**：无。
**类型一致**：mode（'reaction'|'sequence'|'tracking'）、RoundResult{timeMs,isFault} 在 JS/原生/路由参数间一致。
