package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * 保活闹钟接收器：定时唤醒检查短信库 + 确保保活服务存活 + 自续期注册下一次闹钟。
 * 与 KeepAliveService.scheduleNextAlarm 构成永续链：任一端触发都会续期。
 */
class KeepAliveAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    try {
      // 1. 检查短信库（原生闭环触发）
      SmsBridgeModule.checkNewSms(context)
      // 2. 确保保活服务在跑（Android 12+ 后台启动 FGS 可能被系统拒绝）
      try {
        context.startForegroundService(Intent(context, KeepAliveService::class.java))
      } catch (e: Exception) {
        Log.e("KeepAliveAlarm", "拉起保活服务失败: ${e.message}")
      }
    } catch (e: Exception) {
      Log.e("KeepAliveAlarm", "闹钟处理异常: ${e.message}")
    } finally {
      // 3. 自续期：无论服务拉起成败，闹钟链不能断
      KeepAliveService.scheduleNextAlarm(context)
    }
  }
}
