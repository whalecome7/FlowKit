package com.flowkit

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

/** 短信广播接收器：解析 SMS_RECEIVED，拉起保活服务并转发给 JS */
class SmsReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
    if (messages.isEmpty()) return

    val body = StringBuilder()
    for (m in messages) body.append(m.messageBody ?: "")
    val sender = messages[0].originatingAddress ?: ""

    Log.d("SmsReceiver", "SMS from $sender: $body")

    // 确保保活服务在跑
    val serviceIntent = Intent(context, KeepAliveService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }

    // 转发给 JS（App 被杀时先缓存，JS 就绪后补发）
    SmsBridgeModule.emitSms(sender, body.toString())
  }
}
