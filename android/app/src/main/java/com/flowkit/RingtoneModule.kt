package com.flowkit

import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 铃声播放模块（闹钟流通道）：
 * - 使用 STREAM_ALARM / USAGE_ALARM，即使媒体/铃声音量为 0 也能响；
 * - 播放前临时把闹钟音量拉到最大（保证设备静音时也能提醒），停止后恢复原音量；
 * - 播放期间激活 MediaSession + VolumeProvider：系统（小米等 ROM 拦截按键不派发）会把
 *   音量键路由成 VolumeProvider 回调 → 停止铃声；
 * - 兜底：轮询音量，任一音量流被调低（未走 MediaSession 路由的 ROM）也停止。
 */
class RingtoneModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var player: MediaPlayer? = null
  private var originalAlarmVolume: Int = -1
  private var baseMusicVolume: Int = -1

  private val handler = Handler(Looper.getMainLooper())
  private var volumePollRunnable: Runnable? = null

  private var mediaSession: MediaSession? = null
  private var volumeProvider: VolumeProvider? = null

  override fun getName(): String = "RingtoneModule"

  /** 是否正在播放铃声（供音量键等场景判断） */
  companion object {
    @Volatile
    private var playing: Boolean = false

    private var instance: RingtoneModule? = null

    fun isPlaying(): Boolean = playing

    /** 由 MainActivity 在音量键事件中调用：停止当前铃声 */
    fun stopPlaying() {
      instance?.stop()
    }
  }

  init {
    instance = this
  }

  /**
   * 激活 MediaSession + VolumeProvider：Android 11+ 系统把音量键路由给活跃媒体会话，
   * 从而绕过 ROM 对按键事件的拦截。停止时释放。
   */
  private fun activateMediaSession(audioManager: AudioManager) {
    deactivateMediaSession()
    val session = MediaSession(reactApplicationContext, "FlowKitRingtone")
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
        RingtoneModule.stopPlaying()
      }

      override fun onAdjustVolume(direction: Int) {
        RingtoneModule.stopPlaying()
      }
    }
    volumeProvider = vp
    session.setPlaybackToRemote(vp)
    session.isActive = true
    mediaSession = session
  }

  private fun deactivateMediaSession() {
    mediaSession?.let {
      it.isActive = false
      it.release()
    }
    mediaSession = null
    volumeProvider = null
  }

  /** 播放期间轮询音量：任一流被调低即视为用户按了音量键 → 停止（兜底，不依赖系统路由） */
  private fun startVolumePoll(audioManager: AudioManager) {
    stopVolumePoll()
    volumePollRunnable = object : Runnable {
      override fun run() {
        if (!playing) return
        val curMusic = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        val curAlarm = audioManager.getStreamVolume(AudioManager.STREAM_ALARM)
        if (
          (baseMusicVolume >= 0 && curMusic < baseMusicVolume) ||
          (originalAlarmVolume >= 0 && curAlarm < originalAlarmVolume)
        ) {
          stop()
          return
        }
        handler.postDelayed(this, 300)
      }
    }
    handler.postDelayed(volumePollRunnable!!, 300)
  }

  private fun stopVolumePoll() {
    volumePollRunnable?.let { handler.removeCallbacks(it) }
    volumePollRunnable = null
  }

  @ReactMethod
  fun play(url: String?) {
    val ctx = reactApplicationContext
    val audioManager = ctx.getSystemService(AudioManager::class.java) ?: return

    // 0) 若已在播放，先停止旧实例
    stop()

    // 1) 记录并临时拉高闹钟音量（静音/勿扰下也可提醒）
    val stream = AudioManager.STREAM_ALARM
    originalAlarmVolume = audioManager.getStreamVolume(stream)
    audioManager.setStreamVolume(stream, audioManager.getStreamMaxVolume(stream), 0)

    // 2) 播放源：自定义 url 或系统默认闹钟铃声
    val uri: Uri =
      if (!url.isNullOrEmpty()) Uri.parse(url) else Settings.System.DEFAULT_ALARM_ALERT_URI

    try {
      val mp = MediaPlayer()
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      mp.setDataSource(ctx, uri)
      mp.isLooping = true // 循环播放直到 stop()
      mp.setOnPreparedListener { it.start() }
      mp.setOnErrorListener { mp, _, _ -> playing = false; mp.release(); false }
      mp.setOnCompletionListener { playing = false }
      mp.prepareAsync()
      player = mp
      playing = true
      baseMusicVolume = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
      activateMediaSession(audioManager)
      startVolumePoll(audioManager)
    } catch (e: Exception) {
      Log.e("RingtoneModule", "play failed", e)
      restoreVolume(audioManager)
      player = null
      playing = false
    }
  }

  @ReactMethod
  fun stop() {
    stopVolumePoll()
    deactivateMediaSession()
    val audioManager = reactApplicationContext.getSystemService(AudioManager::class.java)
    try {
      player?.let { p ->
        try {
          p.stop()
        } catch (_: Exception) {
        }
        p.release()
      }
    } finally {
      player = null
      playing = false
      restoreVolume(audioManager)
    }
  }

  private fun restoreVolume(audioManager: AudioManager?) {
    if (originalAlarmVolume >= 0 && audioManager != null) {
      audioManager.setStreamVolume(AudioManager.STREAM_ALARM, originalAlarmVolume, 0)
      originalAlarmVolume = -1
    }
  }
}
