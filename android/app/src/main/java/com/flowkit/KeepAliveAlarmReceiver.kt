package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 保活闹钟接收器：定时唤醒检查短信库 + 确保保活服务存活。
 * 由 KeepAliveService 注册的 AlarmManager 精确闹钟触发（充电/活跃时每 30 秒）。
 */
class KeepAliveAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      // 1. 检查短信库（原生闭环触发）
      SmsBridgeModule.checkNewSms(context)
      // 2. 确保保活服务在跑
      val serviceIntent = Intent(context, KeepAliveService::class.java)
      context.startForegroundService(serviceIntent)
    } catch (e: Exception) {
      Log.e("KeepAliveAlarm", "闹钟处理异常: ${e.message}")
    }
  }
}
