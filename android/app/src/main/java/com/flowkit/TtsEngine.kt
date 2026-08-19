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
   * @param onDone 播完 true / 失败 false
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
