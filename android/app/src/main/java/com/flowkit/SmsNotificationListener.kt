package com.flowkit

import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * 通知监听服务连接状态（自诊断页展示用）
 */
object SmsNotificationListenerStatus {
  @Volatile
  var connected: Boolean = false
}

/**
 * 短信通知监听链（第三链路，服务号短信的唯一通路）：
 * HyperOS 对三方 app 隐藏服务号短信的库行（content://sms 查不到 1069/1212 段），
 * 且不分发 SMS_RECEIVED 广播给三方静态接收器；
 * 但系统短信 app 收到任何短信都会发通知（含完整内容），
 * 通知使用权可由用户在系统设置授予，监听通知即可拿到全部短信。
 * 与广播链/库链通过内容指纹互相判重。
 */
class SmsNotificationListener : NotificationListenerService() {

  companion object {
    /** 系统短信包名（小米短信沿用 AOSP 包名 com.android.mms） */
    private const val SMS_PACKAGE = "com.android.mms"

    /** 通知已由本服务处理过的标记（extras key），防止把转发通知再次当新短信 */
    private const val EXTRA_HANDLED_BY = "com.flowkit.HANDLED_BY"

    /** 判定为本 app 转发的通知的标记值 */
    private const val HANDLED_VALUE = "flowkit"

    /** 最新一次转发的通知 key 与内容（同一通知的重复 update 靠它去重） */
    @Volatile
    private var lastForwardedKey: String? = null

    @Volatile
    private var lastForwardedText: String = ""
  }

  override fun onCreate() {
    super.onCreate()
    Log.d("SmsNotifListener", "通知监听服务已创建")
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
    SmsNotificationListenerStatus.connected = true
    Log.i("SmsNotifListener", "通知使用权已连接（短信第三链路激活）")
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    SmsNotificationListenerStatus.connected = false
    Log.w("SmsNotifListener", "通知使用权已断开（请在系统设置重新授权）")
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    if (sbn == null) return
    try {
      // 只处理系统短信 app 的通知
      if (sbn.packageName != SMS_PACKAGE) return
      // 短信渠道过滤：小米短信的消息渠道为 Channel_Msg_*（含 Mms_Default 兜底），
      // 其余渠道（如发送成功回执 Channel_Foreground_Service）不处理
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val channel = sbn.notification.channelId ?: ""
        val isSmsChannel = channel.startsWith("Channel_Msg") || channel == "Mms_Default" || channel == "msg_notify_sms"
        if (!isSmsChannel) {
          Log.d("SmsNotifListener", "忽略非短信渠道通知: channel=$channel")
          return
        }
      }
      // 本 app 转发的通知不再处理（防循环）
      if (sbn.notification.extras.getString(EXTRA_HANDLED_BY) == HANDLED_VALUE) return

      val extras = sbn.notification.extras
      val title = extras.getCharSequence(android.app.Notification.EXTRA_TITLE)?.toString() ?: ""
      var text = extras.getCharSequence(android.app.Notification.EXTRA_TEXT)?.toString() ?: ""
      if (text.isBlank()) return
      // 聚合通知正文形如"[2条]实际内容"（小米短信聚合多条未读），剥离前缀还原最新一条正文
      text = text.replace(Regex("^\\[\\d+条]"), "")

      // 通知 key + 内容联合去重：同一通知的重复 update（内容追加/聚合）跳过；
      // 不同内容（新短信到达导致通知更新）仍会处理，由内容指纹兜底判重
      val key = sbn.key
      if (key == lastForwardedKey && lastForwardedText == text) return
      lastForwardedKey = key
      lastForwardedText = text

      // 短信通知 title 是发件人号码/名称，text 是正文
      val sender = extractSender(title, text)
      Log.i("SmsNotifListener", "捕获短信通知: sender=$sender text=${text.take(40)}")

      // 延迟查库去重：个人号码短信对 app 可见且入库先于通知（实测 DB 链快 ~60ms），
      // 等 1.5s 让库链先处理；若近 60s 内库中已有相同正文（个人号），说明库链负责，跳过转发。
      // 服务号短信在库中对 app 隐藏（永远查不到），通知链是唯一通路，正常转发。
      android.os.Handler(mainLooper).postDelayed({
        try {
          if (isBodyInInboxRecently(text)) {
            Log.d("SmsNotifListener", "库中已有相同正文（个人号，库链负责），跳过通知链转发")
            return@postDelayed
          }
          // 走与广播链相同的处理入口（内容指纹判重 + 原生闭环 + emit）
          SmsBridgeModule.handleBroadcastSms(applicationContext, sender, text, System.currentTimeMillis())
        } catch (e: Throwable) {
          Log.e("SmsNotifListener", "延迟转发失败: ${e.message}", e)
        }
      }, 1500L)
    } catch (e: Throwable) {
      Log.e("SmsNotifListener", "通知处理失败: ${e.message}", e)
    }
  }

  /** 从通知标题提取发件人；提取失败时兜底用正文前缀（不影响内容指纹的正文部分） */
  private fun extractSender(title: String, text: String): String {
    val t = title.trim()
    if (t.isNotEmpty()) return t
    return ""
  }

  /** 近 60 秒内收件箱是否已有相同正文的短信（个人号可见；服务号被 ROM 隐藏查不到） */
  private fun isBodyInInboxRecently(body: String): Boolean {
    return try {
      val since = System.currentTimeMillis() - 60_000L
      contentResolver.query(
        android.net.Uri.parse("content://sms/inbox"),
        arrayOf("_id"),
        "body = ? AND date > ?",
        arrayOf(body, since.toString()),
        null
      )?.use { c -> c.count > 0 } ?: false
    } catch (e: Exception) {
      false
    }
  }
}
