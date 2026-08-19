# 语音播报完善 — 设计文档

日期：2026-08-19
状态：已获用户确认

## 背景

短信触发器铃声动作的语音播报（TTS）功能存在以下问题需完善：
1. TTS 引擎**硬绑定讯飞语记**（com.iflytek.vflynote）——用户未装则不可用
2. **锁屏（原生闭环）不播报**——speech 规则锁屏时只响铃，与前台行为不一致

## 需求（已确认）

1. **三选一互斥**：系统默认铃声 / 自定义铃声 / 语音播报（已有 UI，保持）
2. **语音播报**：使用**系统默认 TTS 引擎**（不依赖任何第三方引擎）
3. **播完即止**：播报完即结束（无 duration 时长控制；duration 参数对 speech 无效）
4. **失败不兜底**：TTS 不可用/初始化失败 = 动作执行失败（不降级响铃）
5. **锁屏也要播报**：原生闭环（SmsNativeEngine）同步支持语音播报，与前台行为一致

## 架构设计

### 公共 TTS 引擎类（新）

**`TtsEngine.kt`**（`android/app/src/main/java/com/flowkit/TtsEngine.kt`）：
- 纯 Android 类（不依赖 RN），接受任意 `Context`
- 使用**系统默认引擎**：`TextToSpeech(context, listener)`（不带 engine 参数）
- API：
  ```kotlin
  class TtsEngine(context: Context) {
    fun isReady(): Boolean
    fun speak(text: String, rate: Float, pitch: Float, onDone: (Boolean) -> Unit)
    fun stop()
    fun shutdown()
  }
  ```
- 闹钟流（USAGE_ALARM，静音也响，与铃声一致）
- `speak` 走 `QUEUE_FLUSH`，播完 `onDone(true)` / 出错 `onDone(false)`
- 初始化失败（onInit != SUCCESS）→ `isReady() = false`，不自动重试不兜底

### 改造 TtsModule（RN 包装层）

- 内部改用 `TtsEngine`（系统默认引擎），去掉讯飞绑定
- `speak(text, rate, pitch, promise)`：TTS 不可用/未就绪 → reject（动作失败）；播完 resolve；出错 reject
- `stop()`：转发 TtsEngine.stop

### 原生闭环支持播报（SmsNativeEngine）

`executeRingtone` 的 speech 分支（当前只响铃）改为：
- `source == "speech"` 且有 speakText → 用 `TtsEngine`（应用上下文）播报，**播完即止**（返回动作结果）
- TTS 不可用 → 动作失败（不响铃降级）
- 播报期间音量键/停止逻辑：**播报短（几秒）**，且 TTS 播完自动停——**不接入 MediaSession 音量键停止**（播报是短时动作，无响铃循环）；如需停止，`stop()` 方法预留

### JS 侧（ActionExecutor）

speech 分支**保持现状**（TtsModule.speak 播完 resolve 即止，失败返回 error）——引擎改动在原生，JS 无需变。

### 失败提示

TTS 不可用时错误信息引导：`"语音引擎不可用，请在系统设置 → 无障碍 → 文字转语音输出 中选择可用引擎"`（前台 Alert / 原生闭环日志+动作失败标记）。

## 文件改动

| 文件 | 改动 |
|------|------|
| `android/.../TtsEngine.kt` | **新建**：公共 TTS 引擎（系统默认）|
| `android/.../TtsModule.kt` | 改用 TtsEngine，去讯飞绑定 |
| `android/.../SmsNativeEngine.kt` | executeRingtone speech 分支：TtsEngine 播报（锁屏）|
| 无 JS 改动 | 动作逻辑不变 |

## 验收标准

1. **前台**：speech 规则触发 → 系统默认 TTS 播报文字，播完即止
2. **锁屏**：speech 规则触发 → 原生闭环播报（与前台一致）
3. **无 TTS 引擎**（或引擎不可用）→ 动作失败（日志标记），不响铃兜底
4. 系统默认铃声 / 自定义铃声 / 语音播报 三选一互斥正常
5. 播报用闹钟流：手机静音时也能听到
