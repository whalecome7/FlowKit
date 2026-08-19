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
  fun speak(text: String, rate: Double, pitch: Double, volume: Double, promise: Promise) {
    val e = engine
    if (e == null || !e.isReady()) {
      promise.reject("TTS_UNAVAILABLE", "语音引擎不可用，请在系统设置 → 无障碍 → 文字转语音输出 中选择可用引擎")
      return
    }
    try {
      // volume 0-100 → 0-1；<=0 表示用当前音量
      e.speak(text, rate.toFloat(), pitch.toFloat(), (volume / 100.0).toFloat()) { ok ->
        // TTS 回调在系统线程，Promise 需主线程
        Handler(Looper.getMainLooper()).post {
          if (ok) promise.resolve(true)
          else promise.reject("TTS_ERROR", "播报失败，请检查系统设置 → 无障碍 → 文字转语音输出")
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
