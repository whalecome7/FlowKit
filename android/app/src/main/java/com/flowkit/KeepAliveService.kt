package com.flowkit

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

/** 保活前台服务：常驻通知 + 短信库轮询 + AlarmManager 精确唤醒兜底（防服务被杀） */
class KeepAliveService : Service() {

  private val handler = Handler(Looper.getMainLooper())
  private val pollIntervalMs = 10_000L
  private val alarmIntervalMs = 30_000L

  /** 每 10 秒检查一次短信库（id 去重，广播正常时不会重复触发） */
  private val pollTask = object : Runnable {
    override fun run() {
      try {
        SmsBridgeModule.checkNewSms(this@KeepAliveService)
        // 心跳：写入诊断时间戳（自诊断页读取）
        getSharedPreferences("flowkit_diag", Context.MODE_PRIVATE)
          .edit()
          .putLong("heartbeat_ts", System.currentTimeMillis())
          .apply()
      } catch (_: Exception) {
      }
      handler.postDelayed(this, pollIntervalMs)
    }
  }

  /** 注册 AlarmManager 精确唤醒（充电/活跃时 30 秒一次，防服务被杀后失联） */
  private fun scheduleAlarm() {
    val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val intent = Intent(this, KeepAliveAlarmReceiver::class.java)
    val pendingIntent = PendingIntent.getBroadcast(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    try {
      alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.RTC_WAKEUP,
        System.currentTimeMillis() + alarmIntervalMs,
        pendingIntent
      )
    } catch (e: Exception) {
      // 某些 ROM 限制高频精确闹钟，降级为 set
      try {
        alarmManager.set(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + alarmIntervalMs, pendingIntent)
      } catch (e2: Exception) {
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForegroundCompat()
    // 预初始化 TTS 引擎（主线程空闲完成 onInit，锁屏播报可直接用）
    SmsNativeEngine.initTts(this)
    handler.post(pollTask)
    scheduleAlarm()
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
    // 渠道重要性创建后不可修改：换新 id 升级 MIN→LOW（LOW 有状态栏图标，MIN 会被 MIUI 收纳）
    val channelId = "flowkit-keepalive-v2"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "FlowKit 保活", NotificationManager.IMPORTANCE_LOW)
      )
      // 删除废弃旧渠道，避免系统设置页出现两个「FlowKit 保活」
      nm.deleteNotificationChannel("flowkit-keepalive")
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
