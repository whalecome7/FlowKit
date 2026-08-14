package com.flowkit

import android.media.AudioAttributes
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * 文字转语音播报模块（系统 TextToSpeech）：
 * - 走闹钟流 USAGE_ALARM（静音模式也响，与铃声一致）
 * - speak(text, rate, pitch)，播完自动停止（Promise resolve）
 */
class TtsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var tts: TextToSpeech? = null
  private var ready = false

  override fun getName(): String = "TtsModule"

  init {
    tts = TextToSpeech(reactContext) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (ready) {
        tts?.language = Locale.getDefault()
      }
    }
  }

  @ReactMethod
  fun speak(text: String, rate: Double, pitch: Double, promise: Promise) {
    val engine = tts
    if (engine == null) {
      promise.reject("TTS_UNAVAILABLE", "TTS 引擎不可用")
      return
    }
    if (!ready) {
      promise.reject("TTS_NOT_READY", "TTS 未初始化完成")
      return
    }
    engine.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build()
    )
    engine.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2.0f))
    engine.setPitch(pitch.toFloat().coerceIn(0.5f, 2.0f))
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {}

      override fun onDone(utteranceId: String?) {
        promise.resolve(true)
      }

      override fun onError(utteranceId: String?) {
        promise.reject("TTS_ERROR", "播报失败")
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?, errorCode: Int) {
        promise.reject("TTS_ERROR", "播报失败 code=$errorCode")
      }
    })
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "flowkit-tts")
  }

  @ReactMethod
  fun stop() {
    tts?.stop()
  }
}
