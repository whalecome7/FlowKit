package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/**
 * 短信广播接收器（双链路之一，广播直收）：
 * - 广播携带完整短信内容（PDU），不经过读库，规避部分 ROM 上"新短信入库后
 *   对三方应用暂不可见"窗口（实测小米 HyperOS）；
 * - 同时拉起保活服务，维持数据库轮询链（兜底：广播未分发时靠它补）。
 */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    Log.d("SmsReceiver", "onReceive called action=${intent.action}")
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    // 1. 广播直收：解析内容并立即处理（实时通路，与库链按内容指纹判重）
    try {
      val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
      if (messages != null && messages.isNotEmpty()) {
        val sender = messages[0].originatingAddress ?: messages[0].displayOriginatingAddress ?: ""
        val body = messages.joinToString("") { it.messageBody ?: "" }
        val timestampMs = messages[0].timestampMillis
        SmsBridgeModule.handleBroadcastSms(context, sender, body, timestampMs)
      }
    } catch (e: Throwable) {
      Log.e("SmsReceiver", "广播短信解析失败: ${e.message}", e)
    }

    // 2. 拉起保活服务，维持数据库轮询链
    try {
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
