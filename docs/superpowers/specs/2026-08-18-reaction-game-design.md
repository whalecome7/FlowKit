# 反应力测试小游戏 — 设计文档

日期：2026-08-18
状态：已获用户批准（三模式确认）

## 背景

FlowKit 首页新增「⚡ 反应力测试」模块。核心要求：**测试结果最接近真实**，重点**消除响应延迟**（JS 线程负载、事件传输、定时器抖动）。

## 核心方案：原生层闭环计时

**普通 JS 计时的延迟误差**：信号显示（8~50ms）+ 触摸→JS 回调（5~30ms）+ 定时器抖动——累计可达 50ms+，结果失真。

**本方案**：计时完全在原生层（信号 View 自定义原生组件）：
- **起点 t0**：原生改变信号 View 状态（变色/高亮/跳位）+ 原生时钟 `SystemClock.uptimeMillis`
- **终点 t1**：信号 View 的 `onTouchEvent` 捕获 `MotionEvent.eventTime`（物理触摸时刻）
- **Δt = t1 - t0**，两者同源（uptimeMillis）→ 无跨层对时误差
- **消除**：JS 线程负载、事件传输、定时器抖动
- **剩余误差**：屏幕刷新帧延迟（≤16ms，物理极限，任何 App 一致）

## 模块架构

```
首页 HomeScreen（模块列表）
  └─「⚡ 反应力测试」模块卡片（moduleRegistry 注册，id: reaction）
       └─ ReactionHome（模式选择页：3 张模式卡片）
            ├─ 经典反应 → ReactionGame（mode=reaction）
            ├─ 序列反应 → ReactionGame（mode=sequence）
            └─ 追踪反应 → ReactionGame（mode=tracking）
                 └─ 5 轮完成 → ReactionResult（结果页：成绩+评级+重玩/返回）
```

### 页面结构

1. **ReactionHome（模式选择）**
   - 3 张模式卡片（⚡ 经典反应 / 🎯 序列反应 / 🎮 追踪反应），各带说明与建议
   - 点击进入对应模式游戏

2. **ReactionGame（游戏页，mode 参数）**
   - 顶部状态区：模式名 / 第 N 轮 / 本轮成绩（RN 渲染）
   - 信号区：原生 SignalAreaView（占 >70% 屏）
   - 底部控制区：开始 / 结束（RN 渲染）
   - 5 轮完成 → 跳转结果页

3. **ReactionResult（结果页）**
   - 汇总：平均 / 最快 / 最慢 / 失误次数
   - 评级：<200ms 优秀 / <280ms 良好 / <380ms 一般 / 其余 需练习
   - **历史最佳**：本模式历史最快成绩（AsyncStorage 持久化，按模式 `@flowkit:reaction:best:{mode}` 存储），刷新记录时提示「新纪录！」
   - 按钮：「再玩一次」（回游戏页）/「返回」（回模式选择）
```

## 三个模式（各 5 轮）

### 1. 经典反应（Reaction）
- 信号区显示「红/等待」→ 随机延迟 2~5 秒 → **变绿** → 点击
- 记录反应时间；**变绿前点击 = 失误**
- 轮次间显示本轮成绩

### 2. 序列反应（Sequence）
- 2×2 四格，等待期显示「等待」→ 随机延迟后**随机一格高亮（绿）** → 点对应格
- 记录反应时间；**点错格 = 失误**（不计时，记失误+1）

### 3. 追踪（Tracking）
- 目标（圆形）随机跳到一个新位置 → 点击目标
- 记录反应时间（跳位→点击）；**点空处 = 失误**

## 视觉布局（几乎整屏色块）

```
┌────────────────────────────┐
│ 顶部状态区（让出区域）        │ ← 模式名 / 第 N 轮 / 本轮成绩（RN 渲染）
│                            │
│                            │
│      信号区（原生 View）      │ ← 占大部分屏（>70%）
│      整屏色块 / 2×2格 / 目标 │
│                            │
│                            │
│ 底部控制区（让出区域）        │ ← 开始 / 结束按钮（RN 渲染）
└────────────────────────────┘

```

- 信号区：**原生 View**（ReactViewManager 创建的自定义 View）
- 状态区/控制区：RN 布局，固定高度，信号区占剩余空间（flex）
- 颜色：红 `#E5484D` / 绿 `#30A46C` / 等待灰 `#8D8D8D`（主题适配）

## 原生实现要点

**SignalAreaViewManager**（`com.facebook.react.uimanager.SimpleViewManager`）：
- 自定义 `SignalAreaView extends View`：
  - `setMode(mode: String)` / `startRound()` / `stop()` 方法（JS 通过 props/命令调用）
  - `onDraw` 绘制当前状态（全屏色块 / 2×2 格子 / 目标圆）
  - `onTouchEvent`：按当前模式判定（经典=任意触摸、序列=命中格、追踪=命中目标）→ 计时 + 回调
  - 内部 `Handler` 处理随机延迟（2~5s，原生线程不受 JS 影响）
- 事件回调（`getExportedCustomDirectEventTypeConstants`）：
  - `onRoundResult`：`{ timeMs, isFault }`（本轮成绩）
  - `onRoundComplete`：`{ round, timeMs }`（5 轮完成，带总成绩）
- JS props：`mode`、`running`（是否开始）

**时序**（经典模式示例）：
1. JS 点「开始」→ 传 `running=true` → 原生显示「红」+ 启动随机延迟
2. 延迟结束 → 原生变「绿」+ 记录 t0
3. 用户触摸 → 原生 onTouchEvent → t1 = eventTime → Δt → 回调 `onRoundResult`
4. JS 显示成绩 → 下一轮（或 5 轮后结果页）

## JS 实现要点

- `ReactionScreen.tsx`：顶部状态（模式切换 + 轮次）+ SignalAreaView + 底部（开始/重来）
- 模式选择：进入页面先选模式（3 张卡片）或页面内切换——**设计：页面内顶部可切换模式**（tab）
- 结果：5 轮完成后显示汇总（平均/最快/最慢/失误），评级（<200 优秀 / <280 良好 / <380 一般 / 其余 需练习）

## 模块注册

- `src/modules/reaction/index.ts`：注册 moduleRegistry（id: 'reaction', name: '反应力测试', homeRoute: 'ReactionHome', enabled: Platform.OS === 'android'）
- `src/app/App.tsx`：注册路由 `ReactionHome`（模式选择/游戏页合一）
- 首页自动显示卡片（moduleRegistry 机制，无需改 HomeScreen）

## 验收标准

1. 首页出现「⚡ 反应力测试」卡片 → 进入游戏
2. 三模式可切换，各 5 轮，结果统计正确
3. **计时准确性**：与第三方秒表/标准反应测试对比，误差 ≤30ms（主要来自帧刷新）
4. 过早点击/点错格正确记为失误
5. 原生计时不受 JS 卡顿影响（可用 JS 死循环验证：JS 卡顿时计时仍准）

## 技术约束

- 不新增 npm 依赖（纯原生 View + RN 壳）
- 原生组件用 ReactViewManager（标准 RN 原生组件机制）
- 兼容 RN 0.86 新架构（SimpleViewManager 或 Fabric 兼容写法——按项目现有原生模块模式）

```
