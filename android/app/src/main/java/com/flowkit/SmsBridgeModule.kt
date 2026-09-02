package com.flowkit

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.app.NotificationManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/** 短信桥接模块：启动保活服务、电池优化、短信事件通道 */
class SmsBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  fun startService() {
    val intent = Intent(reactApplicationContext, KeepAliveService::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      reactApplicationContext.startForegroundService(intent)
    } else {
      reactApplicationContext.startService(intent)
    }
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(callback: Callback) {
    val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val exempt = pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: false
    callback.invoke(exempt)
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations() {
    val pm = reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val exempt = pm?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) ?: false
    if (!exempt) {
      val intent = Intent(
        Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        Uri.parse("package:${reactApplicationContext.packageName}")
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
    }
  }

  private fun sendEvent(sender: String, body: String) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(
        EVENT_NAME,
        Arguments.createMap().apply {
          putString("sender", sender)
          putString("body", body)
        }
      )
  }

  /** 原生已执行动作：事件携带命中信息，JS 仅记录日志不重复执行 */
  private fun sendEventWithLog(sender: String, body: String, match: SmsNativeEngine.NativeMatch) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(
        EVENT_NAME,
        Arguments.createMap().apply {
          putString("sender", sender)
          putString("body", body)
          putBoolean("nativeHandled", true)
          putString("ruleName", match.ruleName)
          val actionResults = Arguments.createArray()
          for ((type, ok) in match.actionResults) {
            actionResults.pushMap(
              Arguments.createMap().apply {
                putString("type", type)
                putBoolean("success", ok)
              }
            )
          }
          putArray("actionResults", actionResults)
        }
      )
  }

  /** 短信数据库监听：小米 ROM 不分发 SMS_RECEIVED 广播，改为监听短信库变化 */
  private val smsObserver = object : ContentObserver(Handler(Looper.getMainLooper())) {
    override fun onChange(selfChange: Boolean) {
      checkNewSms(reactApplicationContext)
    }
  }

  /** 注册短信数据库监听（READ_SMS 已授权时） */
  fun registerSmsWatcher() {
    try {
      val granted = reactApplicationContext
        .checkSelfPermission(android.Manifest.permission.READ_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED
      if (!granted) {
        Log.e("SmsBridge", "READ_SMS 未授权，短信监听不可用")
        return
      }
      reactApplicationContext.contentResolver
        .registerContentObserver(Uri.parse("content://sms"), true, smsObserver)
      Log.d("SmsBridge", "短信数据库监听已注册")
    } catch (e: Exception) {
      Log.e("SmsBridge", "注册短信监听失败: ${e.message}")
    }
  }

  /** JS 授权后调用：重新注册短信监听 */
  @ReactMethod
  fun refreshWatcher() {
    registerSmsWatcher()
  }

  /** 自诊断数据：心跳时间戳 / 规则快照条数 / 权限状态 */
  @ReactMethod
  fun getDiagnostics(callback: Callback) {
    val prefs = reactApplicationContext.getSharedPreferences("flowkit_diag", Context.MODE_PRIVATE)
    val heartbeatTs = prefs.getLong("heartbeat_ts", -1L)
    val map = Arguments.createMap()
    map.putDouble("heartbeatTs", heartbeatTs.toDouble())
    map.putInt("rulesSynced", SmsNativeEngine.rulesCount())
    val perms = Arguments.createMap()
    perms.putBoolean(
      "receiveSms",
      reactApplicationContext.checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED
    )
    perms.putBoolean(
      "readSms",
      reactApplicationContext.checkSelfPermission(Manifest.permission.READ_SMS) == PackageManager.PERMISSION_GRANTED
    )
    perms.putBoolean(
      "notifications",
      reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    )
    perms.putBoolean(
      "batteryExempt",
      (reactApplicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager)
        ?.isIgnoringBatteryOptimizations(reactApplicationContext.packageName) == true
    )
    // 保活通知渠道是否被禁用（IMPORTANCE_NONE = 用户/ROM 关闭；渠道未创建时视为正常）
    val nm = reactApplicationContext.getSystemService(NotificationManager::class.java)
    val channelEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.getNotificationChannel("flowkit-keepalive-v2")?.importance != NotificationManager.IMPORTANCE_NONE
    } else {
      true
    }
    perms.putBoolean("keepaliveChannel", channelEnabled)
    map.putMap("perms", perms)
    callback.invoke(map)
  }

  /** 跳转系统应用通知设置页 */
  @ReactMethod
  fun openNotificationSettings() {
    val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, reactApplicationContext.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:${reactApplicationContext.packageName}"))
    }
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e("SmsBridge", "跳转通知设置失败: ${e.message}")
    }
  }

  /** JS 同步规则快照（锁屏时原生闭环匹配用） */
  @ReactMethod
  fun setRules(rulesJson: String?) {
    SmsNativeEngine.setRules(rulesJson)
  }

  companion object {
    const val NAME = "SmsBridge"
    const val EVENT_NAME = "onSmsReceived"

    private var instance: SmsBridgeModule? = null

    private var lastSmsId: Long = -1

    /** 首次同步标记：进程刚启动时只记录最新短信 id，不处理（防历史短信重放） */
    private var initialized = false

    /** 检查短信库最新短信（供 ContentObserver 与保活服务轮询共用，跨线程安全） */
    @Synchronized
    fun checkNewSms(context: Context) {
      try {
        val resolver = context.contentResolver
        val cursor = resolver.query(
          Uri.parse("content://sms/inbox"),
          arrayOf("_id", "address", "body"),
          null,
          null,
          "date DESC"
        )
        cursor?.use { c ->
          if (c.moveToFirst()) {
            val id = c.getLong(0)
            if (!initialized) {
              // 首查仅同步 id：进程重启后收件箱最新一条是历史短信，不应重放
              lastSmsId = id
              initialized = true
              return
            }
            if (id != lastSmsId) {
              lastSmsId = id
              val sender = c.getString(1) ?: ""
              val body = c.getString(2) ?: ""
              Log.d("SmsBridge", "DB 新短信 #$id from $sender: $body")
              // 原生闭环优先：匹配规则并原生执行动作（锁屏时不依赖 JS）
              val match = SmsNativeEngine.handleSms(context, sender, body)
              if (match != null) {
                // 原生已处理：通知 JS 记录日志（不重复执行动作）
                emitSmsWithLog(sender, body, match)
              } else {
                emitSms(sender, body)
              }
            }
          }
        }
      } catch (e: Exception) {
        Log.e("SmsBridge", "查询短信失败: ${e.message}")
      }
    }

    /** 由 checkNewSms 调用：直接发事件给 JS（App 未启动时事件丢失，由原生闭环兜底） */
    fun emitSms(sender: String, body: String) {
      instance?.sendEvent(sender, body)
    }

    /** 原生已执行动作：事件携带命中信息，JS 仅记录日志 */
    private fun emitSmsWithLog(sender: String, body: String, match: SmsNativeEngine.NativeMatch) {
      instance?.sendEventWithLog(sender, body, match)
    }
  }

  init {
    instance = this
    registerSmsWatcher()
  }
}
