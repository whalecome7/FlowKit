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

/**
 * 短信桥接模块：启动保活服务、电池优化、短信事件通道。
 * 监听范围：普通 SMS（content://sms/inbox）。
 * 已知边界：5G 消息/RCS（如移动"【中国移动双V】"服务号）存独立存储，
 * 系统不向第三方应用开放，无法也不需监听（实测确认）。
 */
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
    // 通知监听链状态（服务号短信的唯一捕获通路）
    map.putBoolean("notifListenerEnabled", isNotificationListenerEnabled())
    map.putBoolean("notifListenerConnected", SmsNotificationListenerStatus.connected)
    // 自愈机制状态：库内最新 id（与处理进度对比暴露"疑似漏收窗口"）/ 指纹数 / 最近重扫时间
    var dbMaxId = -1L
    try {
      reactApplicationContext.contentResolver
        .query(inboxUri(), arrayOf("_id"), null, null, "_id DESC")?.use { c ->
          if (c.moveToFirst()) dbMaxId = c.getLong(0)
        }
    } catch (e: Exception) {
      Log.e("SmsBridge", "诊断查询库内 id 失败: ${e.message}")
    }
    map.putDouble("dbMaxId", dbMaxId.toDouble())
    map.putInt("fingerprintCount", fingerprints.size)
    map.putInt("contentFingerprintCount", contentFingerprints.size)
    map.putDouble("lastRescanTs", prefs.getLong(RESCAN_TS_KEY, -1L).toDouble())
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

  /** 通知使用权是否已授予（短信通知监听链的前提） */
  private fun isNotificationListenerEnabled(): Boolean {
    return try {
      val flat = android.provider.Settings.Secure.getString(
        reactApplicationContext.contentResolver,
        "enabled_notification_listeners"
      ) ?: return false
      flat.split(":").any { it == "${reactApplicationContext.packageName}/${SmsNotificationListener::class.java.name}" }
    } catch (e: Exception) {
      false
    }
  }

  /** 跳转系统"通知使用权"设置页（用户手动授予 FlowKit） */
  @ReactMethod
  fun openNotificationListenerSettings() {
    val intent = Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      reactApplicationContext.startActivity(intent)
    } catch (e: Exception) {
      Log.e("SmsBridge", "跳转通知使用权设置失败: ${e.message}")
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

    /** 已处理短信指纹落盘 key（"id:date" 集合；rowid 复用/重复扫描靠它判重） */
    private const val FINGERPRINTS_KEY = "processed_sms_fingerprints"

    /** 指纹环容量（须 ≥ 重扫窗口 + 余量，保证窗口内已处理短信的判重不失效） */
    private const val MAX_FINGERPRINTS = 500

    /** 自愈重扫间隔（轮次）：每 N 轮从 P-WINDOW 起重扫，捡回被任何原因跳过的短信 */
    private const val FULL_RESCAN_EVERY_ROUNDS = 6

    /** 自愈重扫窗口（条）：重扫以 P 为上限向前回看的 id 范围（sms 表 id 含自己发送的短信） */
    private const val RESCAN_WINDOW = 300

    /** 升级预热条数：首次启用指纹机制时，把 P 之前最近 N 条标记为已处理（防历史重放风暴；须 ≥ 重扫窗口） */
    private const val PREWARM_COUNT = 300

    /** 广播链已处理短信的内容指纹落盘 key（"sender|body|时间秒"；与数据库链互相判重） */
    private const val CONTENT_FPS_KEY = "processed_sms_content_fps"

    /** 内容指纹环容量 */
    private const val MAX_CONTENT_FPS = 50

    /** 最近一次自愈重扫时间戳落盘 key（自诊断页展示用） */
    private const val RESCAN_TS_KEY = "last_rescan_ts"

    private var instance: SmsBridgeModule? = null

    private var lastSmsId: Long = -1

    /** 进度是否已就绪（内存恢复或磁盘恢复；首次运行时才需要"只同步不处理"） */
    private var initialized = false

    /** 已处理指纹（插入序；与磁盘双写，进程重启后恢复） */
    private val fingerprints = LinkedHashSet<String>()

    /** 已处理内容指纹（广播链/数据库链共用，防同一条短信双链路重复触发） */
    private val contentFingerprints = LinkedHashSet<String>()

    /** 轮询轮次计数（驱动周期自愈重扫） */
    private var roundCounter = 0

    private fun diagPrefs(context: Context) =
      context.getSharedPreferences(SmsNativeEngine.DIAG_PREFS, Context.MODE_PRIVATE)

    /**
     * 检查短信库新短信（ContentObserver / 保活轮询 / 闹钟共用，跨线程安全）。
     *
     * 健壮化设计（防漏收）：
     * - 查询下界取 lastSmsId（含边界）而非严格大于：短信表 rowid 会被复用，
     *   被删 id 复用的新短信刚好等于进度值，严格大于会永久跳过；
     * - 指纹判重（id:date）：同 id 但 date 不同 = rowid 复用的新短信，必须处理；
     *   同 id 同 date = 已处理过，只推进指针不重复触发；
     * - 周期自愈重扫：每 N 轮从 P-WINDOW 起全量回看，无论指针因何原因卡住/跳过，
     *   窗口内未处理的短信都会被重新捡起；
     * - 每轮诊断为"疑似卡死"（库内有更新的短信却零处理）留下痕迹。
     */
    @Synchronized
    fun checkNewSms(context: Context) {
      try {
        SmsNativeEngine.ensureRulesLoaded(context)
        val prefs = diagPrefs(context)
        val resolver = context.contentResolver
        val projection = arrayOf("_id", "address", "body", "date")

        // 进程重启后从磁盘恢复处理进度与指纹
        if (!initialized) {
          val saved = prefs.getLong(LAST_SMS_ID_KEY, -1L)
          if (saved >= 0) {
            lastSmsId = saved
            loadFingerprints(prefs)
            loadContentFingerprints(prefs)
            // 首次启用指纹机制（老版本升级上来）：预热 P 之前最近 N 条，
            // 避免自愈重扫把历史短信整批重放
            if (!prefs.contains(FINGERPRINTS_KEY)) prewarmFingerprints(resolver, prefs, inboxUri())
            initialized = true
          }
        }

        val inbox = inboxUri()
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

        // 防御短信库被清空/重置（_id 序列回退）：进度大于库内最大 id 时重置
        // （用 _id DESC 取库内真实最大 id；不再吞掉边界短信，边界由指纹判定）
        var maxInboxId = -1L
        resolver.query(inbox, projection, null, null, "_id DESC")?.use { c ->
          if (c.moveToFirst()) maxInboxId = c.getLong(0)
        }
        if (maxInboxId >= 0 && maxInboxId < lastSmsId) {
          lastSmsId = maxInboxId
          prefs.edit().putLong(LAST_SMS_ID_KEY, lastSmsId).commit()
        }

        // 周期自愈：每 N 轮从 P-WINDOW 回看重扫（id 升序，指针只进不退）
        roundCounter++
        val fullRescan = roundCounter >= FULL_RESCAN_EVERY_ROUNDS
        if (fullRescan) roundCounter = 0
        val floor = if (fullRescan) maxOf(0L, lastSmsId - RESCAN_WINDOW) else lastSmsId

        var handled = 0
        resolver.query(
          inbox, projection,
          "_id >= ?", arrayOf(floor.toString()),
          "_id ASC"
        )?.use { c ->
          while (c.moveToNext() && handled < MAX_CATCHUP_PER_ROUND) {
            val id = c.getLong(0)
            val date = c.getLong(3)
            val fingerprint = "$id:$date"
            if (fingerprints.contains(fingerprint)) {
              // 已处理过：只推进指针（只进不退），不重复触发
              if (id > lastSmsId) {
                lastSmsId = id
                prefs.edit().putLong(LAST_SMS_ID_KEY, id).commit()
              }
              continue
            }
            val sender = c.getString(1) ?: ""
            val body = c.getString(2) ?: ""
            val editor = prefs.edit()
            if (id > lastSmsId) {
              lastSmsId = id
              editor.putLong(LAST_SMS_ID_KEY, id)
            }
            rememberFingerprint(editor, fingerprint)
            // 广播链已处理过同内容短信（SMS_RECEIVED 携带内容不读库，比库链更早）：
            // 只推进指针与指纹，不重复触发动作/记录
            if (contentFingerprints.contains(contentFingerprintOf(sender, body, date))) {
              editor.commit()
              continue
            }
            rememberContentFingerprint(editor, contentFingerprintOf(sender, body, date))
            editor.commit()
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

        // 疑似卡死哨兵：库里有比进度更新的短信却没处理出任何一条（仅诊断轮打印）
        if (fullRescan) {
          prefs.edit().putLong(RESCAN_TS_KEY, System.currentTimeMillis()).apply()
          Log.d("SmsBridge", "轮询诊断: P=$lastSmsId 库max=$maxInboxId 本轮处理=$handled 指纹=${fingerprints.size}")
          logVisibilityProbe(context)
          if (maxInboxId > lastSmsId && handled == 0) {
            Log.w("SmsBridge", "⚠ 疑似漏收: 库max=$maxInboxId 大于进度 P=$lastSmsId 且本轮零处理")
          }
        }
      } catch (e: Exception) {
        Log.e("SmsBridge", "查询短信失败: ${e.message}")
      }
    }

    private fun inboxUri(): Uri = Uri.parse("content://sms/inbox")

    /**
     * ROM 可见性探测：HyperOS 对服务号短信（银行/政务 1069/1212 段）按查询方式过滤，
     * 三方 app 用 content://sms/inbox 查不到这些行（实测 _id=2280 交警短信对 app 隐身）。
     * 依次探测多条查询路径，返回各自可见的最大 _id，供诊断与路径选择。
     */
    private fun probeUriMax(context: Context, uri: Uri, selection: String?): Long {
      return try {
        var max = -1L
        context.contentResolver
          .query(uri, arrayOf("_id"), selection, null, "_id DESC")?.use { c ->
            if (c.moveToFirst()) max = c.getLong(0)
          }
        max
      } catch (e: Exception) {
        -2L
      }
    }

    /** 输出各查询路径的可见最大 id（诊断轮调用；对比即可发现被过滤的短信） */
    fun logVisibilityProbe(context: Context) {
      val inbox = probeUriMax(context, Uri.parse("content://sms/inbox"), null)
      val allTable = probeUriMax(context, Uri.parse("content://sms"), null)
      val typed = probeUriMax(context, Uri.parse("content://sms"), "type = 1")
      val raw = probeUriMax(context, Uri.parse("content://sms/raw"), null)
      Log.w(
        "SmsBridge",
        "可见性探测: inbox=$inbox 全表=$allTable type=1筛选=$typed raw表=$raw (P=$lastSmsId)"
      )
    }

    /**
     * 广播直收链：SMS_RECEIVED 广播携带完整短信内容（PDU），不经过读库。
     * 读库链在部分 ROM 上存在"新短信不可见窗口"（实测小米 HyperOS），
     * 广播链作为实时通路；两条链通过内容指纹互相判重。
     */
    @Synchronized
    fun handleBroadcastSms(context: Context, sender: String, body: String, timestampMs: Long) {
      try {
        if (body.isBlank()) return
        SmsNativeEngine.ensureRulesLoaded(context)
        val prefs = diagPrefs(context)
        if (!initialized) {
          // 进程可能仅被广播拉起（服务未启动）：恢复持久化状态
          val saved = prefs.getLong(LAST_SMS_ID_KEY, -1L)
          if (saved >= 0) {
            lastSmsId = saved
            loadFingerprints(prefs)
            loadContentFingerprints(prefs)
            initialized = true
          }
        }
        val contentFp = contentFingerprintOf(sender, body, timestampMs)
        if (contentFingerprints.contains(contentFp)) {
          Log.d("SmsBridge", "广播短信重复（已处理），跳过: $sender")
          return
        }
        val editor = prefs.edit()
        rememberContentFingerprint(editor, contentFp)
        editor.commit()
        Log.d("SmsBridge", "广播新短信 from $sender: $body")
        val match = SmsNativeEngine.handleSms(context, sender, body)
        if (match != null) {
          emitSmsWithLog(context, sender, body, match)
        } else {
          emitSms(context, sender, body)
        }
      } catch (e: Exception) {
        Log.e("SmsBridge", "广播短信处理失败: ${e.message}")
      }
    }

    /** 内容指纹：发件人|正文|时间（秒级）——与短信入库的 date（毫秒）按秒对齐 */
    private fun contentFingerprintOf(sender: String, body: String, timestampMs: Long): String =
      "$sender|$body|${timestampMs / 1000}"

    /** 记录一条内容指纹（超出容量丢最旧）并写入当前事务 editor */
    private fun rememberContentFingerprint(editor: android.content.SharedPreferences.Editor, fingerprint: String) {
      contentFingerprints.add(fingerprint)
      while (contentFingerprints.size > MAX_CONTENT_FPS) {
        val oldest = contentFingerprints.firstOrNull() ?: break
        contentFingerprints.remove(oldest)
      }
      editor.putString(CONTENT_FPS_KEY, JSONArray(contentFingerprints.toList()).toString())
    }

    /** 从磁盘加载内容指纹环 */
    private fun loadContentFingerprints(prefs: android.content.SharedPreferences) {
      contentFingerprints.clear()
      try {
        val raw = prefs.getString(CONTENT_FPS_KEY, null) ?: return
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) contentFingerprints.add(arr.optString(i, ""))
        contentFingerprints.remove("")
      } catch (e: Exception) {
        Log.e("SmsBridge", "内容指纹恢复失败: ${e.message}")
      }
    }

    /** 从磁盘加载指纹环 */
    private fun loadFingerprints(prefs: android.content.SharedPreferences) {
      fingerprints.clear()
      try {
        val raw = prefs.getString(FINGERPRINTS_KEY, null) ?: return
        val arr = JSONArray(raw)
        for (i in 0 until arr.length()) fingerprints.add(arr.optString(i, ""))
        fingerprints.remove("")
      } catch (e: Exception) {
        Log.e("SmsBridge", "指纹恢复失败: ${e.message}")
      }
    }

    /** 记录一条指纹（超出容量丢最旧）并写入当前事务 editor */
    private fun rememberFingerprint(editor: android.content.SharedPreferences.Editor, fingerprint: String) {
      fingerprints.add(fingerprint)
      while (fingerprints.size > MAX_FINGERPRINTS) {
        val oldest = fingerprints.firstOrNull() ?: break
        fingerprints.remove(oldest)
      }
      editor.putString(FINGERPRINTS_KEY, JSONArray(fingerprints.toList()).toString())
    }

    /** 升级预热：把进度 P 之前最近 N 条标记为已处理（不触发、不推进指针） */
    private fun prewarmFingerprints(
      resolver: android.content.ContentResolver,
      prefs: android.content.SharedPreferences,
      inbox: Uri,
    ) {
      try {
        val projection = arrayOf("_id", "date")
        resolver.query(
          inbox, projection,
          "_id <= ? AND _id >= ?",
          arrayOf(lastSmsId.toString(), maxOf(0L, lastSmsId - PREWARM_COUNT).toString()),
          "_id DESC"
        )?.use { c ->
          while (c.moveToNext()) {
            fingerprints.add("${c.getLong(0)}:${c.getLong(1)}")
          }
        }
        fingerprints.remove("")
        prefs.edit().putString(FINGERPRINTS_KEY, JSONArray(fingerprints.toList()).toString()).commit()
        Log.d("SmsBridge", "指纹预热完成: ${fingerprints.size} 条")
      } catch (e: Exception) {
        Log.e("SmsBridge", "指纹预热失败: ${e.message}")
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
        // commit 同步落盘：入队后进程可能立刻被系统回收，apply 异步写会丢事件
        prefs.edit().putString(PENDING_EVENTS_KEY, arr.toString()).commit()
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
