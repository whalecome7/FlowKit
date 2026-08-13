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

  @ReactMethod
  fun play(url: String?) {
    val ctx = reactApplicationContext
    val audioManager = ctx.getSystemService(AudioManager::class.java) ?: return

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
      mp.setOnErrorListener { mp, _, _ -> mp.release(); false }
      mp.prepareAsync()
      player = mp
    } catch (e: Exception) {
      Log.e("RingtoneModule", "play failed", e)
      restoreVolume(audioManager)
      player = null
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
