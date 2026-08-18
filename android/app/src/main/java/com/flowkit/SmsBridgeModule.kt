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

  @ReactMethod
  fun getPendingSms(callback: Callback) {
    val sms = pendingSms
    if (sms != null) {
      callback.invoke(
        Arguments.createMap().apply {
          putString("sender", sms.first)
          putString("body", sms.second)
        }
      )
    } else {
      callback.invoke()
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
      // 启动时同步一次当前最新短信 id，避免误触发历史短信
      checkNewSms(reactApplicationContext)
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
    map.putMap("perms", perms)
    callback.invoke(map)
  }

  /** JS 同步规则快照（锁屏时原生闭环匹配用） */
  @ReactMethod
  fun setRules(rulesJson: String?) {
    SmsNativeEngine.setRules(rulesJson)
  }

  companion object {
    const val NAME = "SmsBridge"
    const val EVENT_NAME = "onSmsReceived"

    @Volatile
    private var pendingSms: Pair<String, String>? = null

    private var instance: SmsBridgeModule? = null

    private var lastSmsId: Long = -1

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

    /** 由 SmsReceiver 调用：App 在前台直接发事件，否则缓存待 JS 补发 */
    fun emitSms(sender: String, body: String) {
      pendingSms = sender to body
      instance?.sendEvent(sender, body)
    }

    /** 原生已执行动作：事件携带命中信息，JS 仅记录日志 */
    private fun emitSmsWithLog(sender: String, body: String, match: SmsNativeEngine.NativeMatch) {
      pendingSms = sender to body
      instance?.sendEventWithLog(sender, body, match)
    }
  }

  init {
    instance = this
    registerSmsWatcher()
  }
}
