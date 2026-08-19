# 语音播报完善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 语音播报改用系统默认 TTS 引擎（去讯飞绑定），原生闭环（锁屏）同步支持播报，播完即止、失败不兜底。

**Architecture:** 新建公共 TtsEngine.kt（纯 Android，任意 Context，系统默认引擎，闹钟流）；TtsModule（RN 包装）与 SmsNativeEngine（原生闭环）共用；JS 不动。

**Tech Stack:** Kotlin / RN 0.86

---

### Task 1: 公共 TtsEngine

**Files:**
- Create: `android/app/src/main/java/com/flowkit/TtsEngine.kt`

- [ ] **Step 1: 创建 TtsEngine.kt**

```kotlin
package com.flowkit

import android.content.Context
import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * 公共文字转语音引擎（系统默认 TTS，不依赖第三方）：
 * - TextToSpeech(context, listener) 不带 engine 参数 → 系统当前默认引擎
 * - 闹钟流 USAGE_ALARM（静音也播报，与铃声一致）
 * - speak 播完 onDone(true) / 出错 onDone(false)；失败不重试不兜底
 * - 任意 Context 可创建（RN 模块 / 原生闭环共用）
 */
class TtsEngine(context: Context) {

  companion object {
    private const val TAG = "TtsEngine"
    private const val UTTERANCE_ID = "flowkit-tts"
  }

  @Volatile
  private var tts: TextToSpeech? = null

  @Volatile
  private var ready = false

  private var pendingCallback: ((Boolean) -> Unit)? = null

  init {
    tts = TextToSpeech(
      context.applicationContext,
      { status ->
        if (status == TextToSpeech.SUCCESS) {
          ready = true
          Log.d(TAG, "onInit SUCCESS（系统默认引擎）")
          tts?.language = Locale.getDefault()
        } else {
          ready = false
          Log.e(TAG, "onInit 失败 status=$status（系统默认引擎不可用，不兜底）")
        }
      }
    )
  }

  /** TTS 引擎是否就绪 */
  fun isReady(): Boolean = ready

  /**
   * 播报文字（播完即止）。
   * @param onDone 播完 true / 失败 false（主线程回调）
   */
  fun speak(text: String, rate: Float, pitch: Float, onDone: (Boolean) -> Unit) {
    val engine = tts
    if (engine == null || !ready) {
      Log.e(TAG, "speak 失败：引擎未就绪")
      onDone(false)
      return
    }
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    engine.setSpeechRate(rate.coerceIn(0.5f, 2.0f))
    engine.setPitch(pitch.coerceIn(0.5f, 2.0f))
    pendingCallback = onDone
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}

      override fun onDone(utteranceId: String?) {
        Log.d(TAG, "speak done")
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(true)
      }

      override fun onError(utteranceId: String?) {
        Log.e(TAG, "speak onError")
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(false)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?, errorCode: Int) {
        Log.e(TAG, "speak onError code=$errorCode")
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(false)
      }
    })
    val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
    if (result == TextToSpeech.ERROR) {
      Log.e(TAG, "speak 被拒绝")
      val cb = pendingCallback
      pendingCallback = null
      cb?.invoke(false)
    }
  }

  /** 停止播报 */
  fun stop() {
    tts?.stop()
  }

  /** 释放资源 */
  fun shutdown() {
    tts?.shutdown()
    tts = null
    ready = false
  }
}
```

- [ ] **Step 2: 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/flowkit/TtsEngine.kt
git commit -m "feat: 公共 TTS 引擎（系统默认，闹钟流，播完即止）"
```

---

### Task 2: TtsModule 改用 TtsEngine（去讯飞绑定）

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/TtsModule.kt`

- [ ] **Step 1: 重写 TtsModule**

将 TtsModule.kt 整体替换为（用 TtsEngine，去掉讯飞/重试逻辑）：

```kotlin
package com.flowkit

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 文字转语音播报模块（RN 包装）：
 * - 底层用公共 TtsEngine（系统默认引擎）
 * - speak 播完 resolve；引擎不可用 reject（动作失败，不兜底）
 */
class TtsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var engine: TtsEngine? = null

  override fun getName(): String = "TtsModule"

  init {
    // TextToSpeech 绑定引擎需主线程 Looper，延迟到主线程创建
    Handler(Looper.getMainLooper()).post { engine = TtsEngine(reactApplicationContext) }
  }

  @ReactMethod
  fun speak(text: String, rate: Double, pitch: Double, promise: Promise) {
    val e = engine
    if (e == null || !e.isReady()) {
      promise.reject("TTS_UNAVAILABLE", "语音引擎不可用，请在系统设置 → 无障碍 → 文字转语音输出 中选择可用引擎")
      return
    }
    try {
      e.speak(text, rate.toFloat(), pitch.toFloat()) { ok ->
        if (ok) {
          promise.resolve(true)
        } else {
          promise.reject("TTS_ERROR", "播报失败，请检查系统设置 → 无障碍 → 文字转语音输出")
        }
      }
    } catch (err: Exception) {
      promise.reject("TTS_ERROR", err.message ?: "播报失败")
    }
  }

  @ReactMethod
  fun stop() {
    engine?.stop()
  }
}
```

（注意：TextToSpeech 的 onInit/回调可能在非主线程——Promise 的 resolve/reject 需在主线程调用；TtsEngine 的 onDone 回调来自系统 TTS 线程——**在 TtsModule.speak 包装时用 Handler(mainLooper).post 保证 promise 在主线程**：

```kotlin
e.speak(text, rate.toFloat(), pitch.toFloat()) { ok ->
  Handler(Looper.getMainLooper()).post {
    if (ok) promise.resolve(true) else promise.reject("TTS_ERROR", "播报失败")
  }
}
```
）

- [ ] **Step 2: 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/flowkit/TtsModule.kt
git commit -m "refactor: TTS 改用系统默认引擎（去讯飞绑定与重试兜底）"
```

---

### Task 3: 原生闭环支持播报（SmsNativeEngine）

**Files:**
- Modify: `android/app/src/main/java/com/flowkit/SmsNativeEngine.kt`

- [ ] **Step 1: executeRingtone 支持 speech**

读 `SmsNativeEngine.kt` 的 `executeRingtone`（约 279 行），在函数开头（`stopRingtone()` 之前）加入 speech 分支：

```kotlin
private fun executeRingtone(context: Context, params: JSONObject): Boolean {
  val source = params.optString("source", "default")
  // 语音播报：系统默认 TTS，播完即止，失败不兜底（不降级响铃）
  if (source == "speech") {
    val speakText = params.optString("speakText", "").trim()
    if (speakText.isEmpty()) return false
    val rate = params.optDouble("rate", 1.0).toFloat()
    val pitch = params.optDouble("pitch", 1.0).toFloat()
    return speakViaTts(context, speakText, rate, pitch)
  }
  // 铃声（默认/文件）：原逻辑不变
  ...
}

/** 锁屏语音播报：TtsEngine 播完即止 */
private fun speakViaTts(context: Context, text: String, rate: Float, pitch: Float): Boolean {
  val engine = TtsEngine(context)
  if (!engine.isReady()) {
    Log.e(TAG, "语音播报失败：系统 TTS 引擎不可用")
    engine.shutdown()
    return false
  }
  val latch = CountDownLatch(1)
  val result = booleanArrayOf(false)
  engine.speak(text, rate, pitch) { ok ->
    result[0] = ok
    latch.countDown()
  }
  try {
    latch.await(15, TimeUnit.SECONDS)  // 播报最长等 15 秒，防卡死
  } catch (e: InterruptedException) {
    Thread.currentThread().interrupt()
  }
  engine.shutdown()
  return result[0]
}
```

（需 import：`java.util.concurrent.CountDownLatch`、`java.util.concurrent.TimeUnit`。）

- [ ] **Step 2: 编译**

Run: `cd android && ./gradlew :app:compileDebugKotlin 2>&1 | grep -E "^e: |BUILD" | head -5`
Expected: BUILD SUCCESSFUL

- [ ] **Step 3: 提交**

```bash
git add android/app/src/main/java/com/flowkit/SmsNativeEngine.kt
git commit -m "feat: 原生闭环语音播报（锁屏 TTS 播完即止，失败不兜底）"
```

---

### Task 4: 编译 + 真机验收

**Files:** 无

- [ ] **Step 1: 全量构建**

Run: `cd android && ./gradlew assembleRelease 2>&1 | tail -2`

- [ ] **Step 2: 主人验收（手动）**

1. 规则编辑 → 铃声动作 → 声音来源选「文字播报」→ 填播报文字（如"检测到违停短信"）
2. **前台**：模拟短信触发 → 系统默认 TTS 播报文字 → 播完即止
3. **锁屏**：锁屏后触发 → 原生闭环播报（与前台一致）
4. 手机静音 → 播报仍可听到（闹钟流）
5. 系统设置中把默认 TTS 引擎设为不可用/未安装 → 触发 → 动作失败（日志标记失败），不响铃兜底
6. 默认铃声 / 自定义铃声 不受影响（三选一互斥正常）

- [ ] **Step 3: 记录结果**

---

## Self-Review

**Spec 覆盖**：系统默认引擎（Task 1/2）✓；播完即止（Task 1/3）✓；失败不兜底（Task 1/2/3）✓；锁屏播报（Task 3）✓；验收（Task 4）✓。
**占位符**：无。
**类型一致**：TtsEngine.speak(text, rate: Float, pitch: Float, onDone: (Boolean) -> Unit) 在 Task 1/2/3 一致。
