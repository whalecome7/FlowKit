package com.flowkit

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * 公共文字转语音引擎（系统默认 TTS，不依赖第三方）：
 * - TextToSpeech(context, listener) 不带 engine 参数 → 系统当前默认引擎
 * - 闹钟流 USAGE_ALARM（静音也播报，与铃声一致）
 * - speak 播完 onDone(true) / 出错 onDone(false)；失败不重试不兜底
 * - 播报期间激活 MediaSession + VolumeProvider：按音量键 → 停止播报（视为正常完成）
 * - 任意 Context 可创建（RN 模块 / 原生闭环共用）
 */
class TtsEngine(context: Context) {

  companion object {
    private const val TAG = "TtsEngine"
    private const val UTTERANCE_ID = "flowkit-tts"
  }

  private val appContext = context.applicationContext

  @Volatile
  private var tts: TextToSpeech? = null

  @Volatile
  private var ready = false

  private var pendingCallback: ((Boolean) -> Unit)? = null

  // 音量键停止（MediaSession + VolumeProvider）
  private var mediaSession: MediaSession? = null
  private var volumeProvider: VolumeProvider? = null

  init {
    tts = TextToSpeech(
      appContext,
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
   * @param onDone 播完 true / 失败 false / 音量键停止 true（视为正常完成）
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
        deactivateVolumeStop()
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(true)
      }

      override fun onError(utteranceId: String?) {
        Log.e(TAG, "speak onError")
        deactivateVolumeStop()
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(false)
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?, errorCode: Int) {
        Log.e(TAG, "speak onError code=$errorCode")
        deactivateVolumeStop()
        val cb = pendingCallback
        pendingCallback = null
        cb?.invoke(false)
      }
    })
    // 激活 MediaSession + VolumeProvider：音量键路由过来 → 停止播报
    activateVolumeStop()
    val result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, UTTERANCE_ID)
    if (result == TextToSpeech.ERROR) {
      Log.e(TAG, "speak 被拒绝")
      deactivateVolumeStop()
      val cb = pendingCallback
      pendingCallback = null
      cb?.invoke(false)
    }
  }

  /** 激活 MediaSession + VolumeProvider：系统把音量键路由为回调 → 停止播报 */
  private fun activateVolumeStop() {
    deactivateVolumeStop()
    val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    val session = MediaSession(appContext, "FlowKitTts")
    session.setPlaybackState(
      PlaybackState.Builder()
        .setActions(0)
        .setState(PlaybackState.STATE_PLAYING, 0, 1.0f)
        .build()
    )
    session.setCallback(object : MediaSession.Callback() {})
    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    val cur = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
    val vp = object : VolumeProvider(VolumeProvider.VOLUME_CONTROL_ABSOLUTE, max, cur) {
      override fun onSetVolumeTo(volume: Int) {
        stopByVolumeKey()
      }

      override fun onAdjustVolume(direction: Int) {
        stopByVolumeKey()
      }
    }
    volumeProvider = vp
    session.setPlaybackToRemote(vp)
    session.isActive = true
    mediaSession = session
  }

  private fun deactivateVolumeStop() {
    mediaSession?.let {
      it.isActive = false
      it.release()
    }
    mediaSession = null
    volumeProvider = null
  }

  /** 音量键触发：停止播报，视为正常完成（与铃声停止语义一致） */
  private fun stopByVolumeKey() {
    Log.d(TAG, "音量键停止播报")
    tts?.stop()
    deactivateVolumeStop()
    val cb = pendingCallback
    pendingCallback = null
    cb?.invoke(true)
  }

  /** 停止播报 */
  fun stop() {
    tts?.stop()
  }

  /** 释放资源 */
  fun shutdown() {
    deactivateVolumeStop()
    tts?.shutdown()
    tts = null
    ready = false
  }
}
