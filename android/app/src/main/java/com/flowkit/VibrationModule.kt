package com.flowkit

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VibrationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "VibrationModule"

  @ReactMethod
  fun vibrate(pattern: String, amplitude: Int) {
    val vibrator =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        reactContext.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        reactContext.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      } ?: return

    val times = pattern.split(",").mapNotNull { it.trim().toLongOrNull() }.toLongArray()
    val amp = if (amplitude in 1..255) amplitude else VibrationEffect.DEFAULT_AMPLITUDE

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val effect: VibrationEffect =
        if (times.isEmpty()) {
          VibrationEffect.createOneShot(500, amp)
        } else {
          val waveform = if (times.size % 2 == 0) times else times + longArrayOf(1000)
          if (amp == VibrationEffect.DEFAULT_AMPLITUDE) {
            // 未指定力度：timings + repeat=-1（不重复）
            VibrationEffect.createWaveform(waveform, -1)
          } else {
            // 指定力度：timings + amplitudes 数组 + repeat=-1
            val amplitudes = IntArray(waveform.size) { amp }
            VibrationEffect.createWaveform(waveform, amplitudes, -1)
          }
        }
      vibrator.vibrate(effect)
    } else {
      @Suppress("DEPRECATION")
      if (times.isEmpty()) {
        vibrator.vibrate(500)
      } else {
        vibrator.vibrate(times, -1)
      }
    }
  }
}
