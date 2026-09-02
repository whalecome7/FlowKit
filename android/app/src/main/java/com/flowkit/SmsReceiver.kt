package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/** 短信广播接收器：仅拉起保活服务（短信处理统一走数据库链，防双链路重复触发） */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    Log.d("SmsReceiver", "onReceive called action=${intent.action}")
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    try {
      // 拉起保活服务：短信由 ContentObserver/轮询从数据库捕获（lastSmsId 去重）
      val serviceIntent = Intent(context, KeepAliveService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        try {
          context.startForegroundService(serviceIntent)
        } catch (e: Exception) {
          Log.e("SmsReceiver", "拉起保活服务失败: ${e.message}")
        }
      } else {
        context.startService(serviceIntent)
      }
    } catch (e: Throwable) {
      Log.e("SmsReceiver", "onReceive 异常: ${e.message}", e)
    }
  }
}
