package com.flowkit

import android.media.AudioAttributes
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * 文字转语音播报模块（系统 TextToSpeech）：
 * - 走闹钟流 USAGE_ALARM（静音模式也响，与铃声一致）
 * - speak(text, rate, pitch)，播完自动停止（Promise resolve）
 * - 初始化失败自动重试（部分系统引擎首次绑定较慢）
 */
class TtsModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var tts: TextToSpeech? = null
  private var ready = false
  private var retryCount = 0

  override fun getName(): String = "TtsModule"

  init {
    // TextToSpeech 绑定引擎必须在主线程（bindService 需要主线程 Looper）
    // RN 模块 init 运行在线程池线程，因此延迟到主线程连接
    Handler(Looper.getMainLooper()).post { connect() }
  }

  /** 连接 TTS 引擎：显式绑定第三方引擎（讯飞语记），失败延迟重试 */
  private fun connect() {
    // 讯飞语记注册了标准 TTS 引擎服务且 exported=true，可被第三方绑定；
    // 小米默认引擎（mibrain）仅白名单可用
    val target = "com.iflytek.vflynote"
    Log.d("TtsModule", "绑定引擎: $target")
    tts = TextToSpeech(reactApplicationContext, { status ->
      if (status == TextToSpeech.SUCCESS) {
        ready = true
        Log.d("TtsModule", "onInit SUCCESS engine=$target")
        tts?.language = Locale.getDefault()
      } else {
        Log.e("TtsModule", "onInit 失败 status=$status engine=$target retry=$retryCount")
        if (retryCount < 3) {
          retryCount++
          Handler(Looper.getMainLooper()).postDelayed({
            tts?.shutdown()
            tts = null
            connect()
          }, 2000L * retryCount)
        }
      }
    }, target)
  }

  @ReactMethod
  fun speak(text: String, rate: Double, pitch: Double, promise: Promise) {
    val engine = tts
    if (engine == null) {
      Log.e("TtsModule", "speak failed: TTS 引擎不可用")
      promise.reject("TTS_UNAVAILABLE", "语音引擎不可用，请检查系统设置 → 无障碍 → 文字转语音输出")
      return
    }
    if (!ready) {
      Log.e("TtsModule", "speak failed: TTS 未初始化完成")
      promise.reject("TTS_NOT_READY", "语音引擎初始化中或不可用，请检查系统设置 → 无障碍 → 文字转语音输出")
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
        Log.d("TtsModule", "speak done")
        promise.resolve(true)
      }

      override fun onError(utteranceId: String?) {
        Log.e("TtsModule", "speak onError")
        promise.reject("TTS_ERROR", "播报失败")
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?, errorCode: Int) {
        Log.e("TtsModule", "speak onError code=$errorCode")
        promise.reject("TTS_ERROR", "播报失败 code=$errorCode")
      }
    })
    val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "flowkit-tts")
    Log.d("TtsModule", "speak called text='$text' rate=$rate pitch=$pitch result=$result")
    if (result == TextToSpeech.ERROR) {
      promise.reject("TTS_ERROR", "语音引擎拒绝播报，请检查系统设置 → 无障碍 → 文字转语音输出")
    }
  }

  @ReactMethod
  fun stop() {
    tts?.stop()
  }
}
