package com.flowkit

import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 铃声播放模块（闹钟流通道）：
 * - 使用 STREAM_ALARM / USAGE_ALARM，即使媒体/铃声音量为 0 也能响；
 * - 播放前临时把闹钟音量拉到最大（保证设备静音时也能提醒），停止后恢复原音量。
 */
class RingtoneModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private var player: MediaPlayer? = null
  private var originalAlarmVolume: Int = -1

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
    } catch (e: Exception) {
      Log.e("RingtoneModule", "play failed", e)
      restoreVolume(audioManager)
      player = null
      playing = false
    }
  }

  @ReactMethod
  fun stop() {
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
