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
import android.app.AlarmManager
import android.app.NotificationManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
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

  /**
   * 发送短信事件给 JS。
   * @return 是否投递成功（RN 未就绪或发送异常返回 false，调用方据此入离线队列）
   */
  private fun trySendEvent(
    sender: String,
    body: String,
    match: SmsNativeEngine.NativeMatch?,
  ): Boolean {
    return try {
      if (!reactContext.hasActiveReactInstance()) return false
      val params = Arguments.createMap().apply {
        putString("sender", sender)
        putString("body", body)
        if (match != null) {
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
      }
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit(EVENT_NAME, params)
      true
    } catch (e: Exception) {
      Log.e("SmsBridge", "事件发送失败: ${e.message}")
      false
    }
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
    // 精确闹钟授权（API 31+ 决定 Doze 下唤醒精度；低版本无此限制视为已授权）
    val alarmManager = reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
    val canExact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager?.canScheduleExactAlarms() == true
    map.putBoolean("canExactAlarms", canExact)
    // 上次服务销毁时间（定位被杀时机）
    map.putDouble("serviceDeadTs", prefs.getLong("service_dead_ts", -1L).toDouble())
    // 短信捕获补漏：处理进度 / 离线待补记事件数 / 磁盘规则快照条数（-1 = 无快照）
    map.putDouble("lastSmsId", prefs.getLong(LAST_SMS_ID_KEY, -1L).toDouble())
    map.putInt(
      "pendingSmsCount",
      try {
        JSONArray(prefs.getString(PENDING_EVENTS_KEY, "[]") ?: "[]").length()
      } catch (e: Exception) {
        0
      }
    )
    map.putInt("rulesOnDisk", SmsNativeEngine.diskRulesCount(reactApplicationContext))
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
    // 保活通知渠道可用性（低于 LOW 会被收纳/静默：NONE=禁用，MIN=MIUI 收纳无状态栏图标；渠道未创建视为正常）
    val nm = reactApplicationContext.getSystemService(NotificationManager::class.java)
    val channelEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      (nm.getNotificationChannel("flowkit-keepalive-v2")?.importance
        ?: NotificationManager.IMPORTANCE_LOW) >= NotificationManager.IMPORTANCE_LOW
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

  /** 跳转精确闹钟授权页（API 31+） */
  @ReactMethod
  fun openExactAlarmSettings() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      .setData(Uri.parse("package:${reactApplicationContext.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e("SmsBridge", "跳转精确闹钟设置失败: ${e.message}")
    }
  }

  /** JS 同步规则快照（锁屏时原生闭环匹配用） */
  @ReactMethod
  fun setRules(rulesJson: String?) {
    SmsNativeEngine.setRules(rulesJson)
    // 规则快照落盘：进程被闹钟后台拉起（RN 未启动）时原生可从磁盘恢复，离线匹配不失效
    try {
      val editor = diagPrefs(reactApplicationContext).edit()
      if (rulesJson.isNullOrBlank()) {
        editor.remove(SmsNativeEngine.RULES_KEY)
      } else {
        editor.putString(SmsNativeEngine.RULES_KEY, rulesJson)
      }
      editor.apply()
    } catch (e: Exception) {
      Log.e("SmsBridge", "规则快照落盘失败: ${e.message}")
    }
  }

  /** JS 启动时取走并清空离线短信事件队列（RN 不可用期间积压的短信，补记日志） */
  @ReactMethod
  fun takePendingSmsEvents(callback: Callback) {
    val json = try {
      val prefs = diagPrefs(reactApplicationContext)
      val events = prefs.getString(PENDING_EVENTS_KEY, "[]") ?: "[]"
      prefs.edit().remove(PENDING_EVENTS_KEY).apply()
      events
    } catch (e: Exception) {
      Log.e("SmsBridge", "读取离线事件失败: ${e.message}")
      "[]"
    }
    callback.invoke(json)
  }

  companion object {
    const val NAME = "SmsBridge"
    const val EVENT_NAME = "onSmsReceived"

    /** 短信处理进度落盘 key（进程被杀重启后据此补处理窗口内短信） */
    private const val LAST_SMS_ID_KEY = "last_sms_id"

    /** RN 不可用时的离线短信事件队列 key（JS 启动后补记日志） */
    private const val PENDING_EVENTS_KEY = "pending_sms_events"

    /** 离线队列上限：超出丢弃最旧，防无限膨胀 */
    private const val MAX_PENDING_EVENTS = 20

    /** 单轮补处理上限：死亡窗口内短信过多时分轮消化，避免单次查询过重 */
    private const val MAX_CATCHUP_PER_ROUND = 50

    private var instance: SmsBridgeModule? = null

    private var lastSmsId: Long = -1

    /** 进度是否已就绪（内存恢复或磁盘恢复；首次运行时才需要"只同步不处理"） */
    private var initialized = false

    private fun diagPrefs(context: Context) =
      context.getSharedPreferences(SmsNativeEngine.DIAG_PREFS, Context.MODE_PRIVATE)

    /**
     * 检查短信库新短信（ContentObserver / 保活轮询 / 闹钟共用，跨线程安全）。
     * 进度（lastSmsId）持久化到磁盘：进程被 MIUI 杀死再由闹钟拉起时，
     * 死亡窗口内到达的短信按 id 区间补处理，不再被"首查同步"误吞。
     */
    @Synchronized
    fun checkNewSms(context: Context) {
      try {
        SmsNativeEngine.ensureRulesLoaded(context)
        val prefs = diagPrefs(context)
        val resolver = context.contentResolver
        val projection = arrayOf("_id", "address", "body")

        // 进程重启后从磁盘恢复处理进度
        if (!initialized) {
          val saved = prefs.getLong(LAST_SMS_ID_KEY, -1L)
          if (saved >= 0) {
            lastSmsId = saved
            initialized = true
          }
        }

        val inbox = Uri.parse("content://sms/inbox")
        if (!initialized) {
          // 首次运行（无任何持久化进度）：只同步最新 id，防历史短信重放
          resolver.query(inbox, projection, null, null, "date DESC")?.use { c ->
            if (c.moveToFirst()) {
              lastSmsId = c.getLong(0)
              prefs.edit().putLong(LAST_SMS_ID_KEY, lastSmsId).commit()
              initialized = true
            }
          }
          return
        }

        // 防御短信库被清空/重置（_id 序列回退）：进度大于库内最新 id 时重置
        resolver.query(inbox, projection, null, null, "date DESC")?.use { c ->
          if (c.moveToFirst() && c.getLong(0) < lastSmsId) {
            lastSmsId = c.getLong(0)
            prefs.edit().putLong(LAST_SMS_ID_KEY, lastSmsId).commit()
            return
          }
        }

        // 补处理进度之后的所有短信（id 升序，逐条推进并落盘，中断不重复）
        resolver.query(
          inbox, projection,
          "_id > ?", arrayOf(lastSmsId.toString()),
          "date ASC"
        )?.use { c ->
          var handled = 0
          while (c.moveToNext() && handled < MAX_CATCHUP_PER_ROUND) {
            val id = c.getLong(0)
            lastSmsId = id
            prefs.edit().putLong(LAST_SMS_ID_KEY, id).commit()
            val sender = c.getString(1) ?: ""
            val body = c.getString(2) ?: ""
            Log.d("SmsBridge", "DB 新短信 #$id from $sender: $body")
            // 原生闭环优先：匹配规则并原生执行动作（锁屏时不依赖 JS）
            val match = SmsNativeEngine.handleSms(context, sender, body)
            if (match != null) {
              emitSmsWithLog(context, sender, body, match)
            } else {
              emitSms(context, sender, body)
            }
            handled++
          }
        }
      } catch (e: Exception) {
        Log.e("SmsBridge", "查询短信失败: ${e.message}")
      }
    }

    /** 发送事件给 JS；RN 不可用时返回 false（由调用方入离线队列） */
    fun emitSms(context: Context, sender: String, body: String) {
      val delivered = instance?.trySendEvent(sender, body, null) ?: false
      if (!delivered) enqueuePendingEvent(context, sender, body, null)
    }

    /** 原生已执行动作：事件携带命中信息，JS 仅记录日志 */
    private fun emitSmsWithLog(
      context: Context,
      sender: String,
      body: String,
      match: SmsNativeEngine.NativeMatch,
    ) {
      val delivered = instance?.trySendEvent(sender, body, match) ?: false
      if (!delivered) enqueuePendingEvent(context, sender, body, match)
    }

    /** RN 未启动（闹钟后台拉起进程）时事件入队，JS initSmsBridge 时补记 */
    @Synchronized
    private fun enqueuePendingEvent(
      context: Context,
      sender: String,
      body: String,
      match: SmsNativeEngine.NativeMatch?,
    ) {
      try {
        val prefs = diagPrefs(context)
        val arr = JSONArray(prefs.getString(PENDING_EVENTS_KEY, "[]") ?: "[]")
        val obj = JSONObject()
          .put("sender", sender)
          .put("body", body)
          .put("ts", System.currentTimeMillis())
        if (match != null) {
          obj.put("nativeHandled", true)
          obj.put("ruleName", match.ruleName)
          val results = JSONArray()
          for ((type, ok) in match.actionResults) {
            results.put(JSONObject().put("type", type).put("success", ok))
          }
          obj.put("actionResults", results)
        }
        arr.put(obj)
        while (arr.length() > MAX_PENDING_EVENTS) arr.remove(0)
        prefs.edit().putString(PENDING_EVENTS_KEY, arr.toString()).apply()
        Log.d("SmsBridge", "RN 不可用，短信事件已入离线队列（当前 ${arr.length()} 条）")
      } catch (e: Exception) {
        Log.e("SmsBridge", "离线事件入队失败: ${e.message}")
      }
    }
  }

  init {
    instance = this
    registerSmsWatcher()
  }
}
