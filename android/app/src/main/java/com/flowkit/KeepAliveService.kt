package com.flowkit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/** 保活前台服务：常驻通知 + 短信库低频轮询兜底（小米锁屏屏蔽广播时的替代路径） */
class KeepAliveService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private val pollIntervalMs = 10_000L

  /** 每 10 秒检查一次短信库（id 去重，广播正常时不会重复触发） */
  private val pollTask = object : Runnable {
    override fun run() {
      try {
        SmsBridgeModule.checkNewSms(this@KeepAliveService)
      } catch (_: Exception) {
      }
      handler.postDelayed(this, pollIntervalMs)
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForegroundCompat()
    handler.post(pollTask)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundCompat()
    return START_STICKY // 被系统回收后尝试重建
  }

  override fun onDestroy() {
    handler.removeCallbacks(pollTask)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun startForegroundCompat() {
    val channelId = "flowkit-keepalive"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "FlowKit 保活", NotificationManager.IMPORTANCE_MIN)
      )
    }
    val contentIntent = PendingIntent.getActivity(
      this, 0, Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_IMMUTABLE
    )
    val notification: Notification =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(this, channelId)
          .setContentTitle("FlowKit 正在工作")
          .setContentText("你的贴心助手，让生活更高效")
          .setSmallIcon(android.R.drawable.ic_popup_sync)
          .setContentIntent(contentIntent)
          .setOngoing(true)
          .build()
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
          .setContentTitle("FlowKit 正在工作")
          .setContentText("你的贴心助手，让生活更高效")
          .setSmallIcon(android.R.drawable.ic_popup_sync)
          .setContentIntent(contentIntent)
          .setOngoing(true)
          .build()
      }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(1, notification)
    }
  }
}
