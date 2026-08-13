package com.flowkit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** 保活前台服务：常驻通知「FlowKit 正在监听短信」 */
class KeepAliveService : Service() {

  override fun onCreate() {
    super.onCreate()
    startForegroundCompat()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundCompat()
    return START_STICKY // 被系统回收后尝试重建
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
          .setContentTitle("FlowKit 正在监听短信")
          .setContentText("用于及时提醒重要短信")
          .setSmallIcon(android.R.drawable.ic_popup_sync)
          .setContentIntent(contentIntent)
          .setOngoing(true)
          .build()
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(this)
          .setContentTitle("FlowKit 正在监听短信")
          .setContentText("用于及时提醒重要短信")
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
