package com.flowkit

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar
import java.util.regex.Pattern

/**
 * 原生短信触发引擎（锁屏兜底闭环）：
 * - 规则快照由 JS 同步（setRules），原生自行匹配并执行动作；
 * - 不依赖 JS/RN，锁屏时只要前台服务存活即可秒级触发；
 * - 动作：震动 / 铃声（闹钟流）/ 通知 / 手表推送（高重要级通知）。
 */
object SmsNativeEngine {

  private const val TAG = "SmsNative"

  @Volatile
  private var rules: List<NativeRule> = emptyList()

  private val handler = Handler(Looper.getMainLooper())

  // 铃声播放状态（MediaSession 音量键停止）
  private var ringtonePlayer: MediaPlayer? = null
  private var ringtoneSession: MediaSession? = null
  private var ringtoneVolumeProvider: VolumeProvider? = null
  private var ringtoneStopRunnable: Runnable? = null

  // 复用 TTS 引擎（服务启动时主线程预初始化，避免锁屏 onInit 死锁；播报异步不阻塞）
  @Volatile
  private var ttsEngine: TtsEngine? = null

  /** 预初始化 TTS 引擎（须主线程调用；onInit 需主线程空闲完成） */
  fun initTts(context: Context) {
    if (ttsEngine == null && Looper.myLooper() == Looper.getMainLooper()) {
      ttsEngine = TtsEngine(context)
      Log.d(TAG, "TTS 引擎预初始化已发起")
    }
  }

  /** JS 同步规则快照（JSON 数组，与 RuleEngine 数据结构一致） */
  fun setRules(rulesJson: String?) {
    if (rulesJson.isNullOrBlank()) {
      rules = emptyList()
      return
    }
    try {
      val arr = JSONArray(rulesJson)
      val list = mutableListOf<NativeRule>()
      for (i in 0 until arr.length()) {
        val obj = arr.optJSONObject(i) ?: continue
        val conditions = mutableListOf<NativeCondition>()
        val condArr = obj.optJSONArray("conditions") ?: JSONArray()
        for (j in 0 until condArr.length()) {
          val c = condArr.optJSONObject(j) ?: continue
          conditions.add(
            NativeCondition(
              field = c.optString("field", "body"),
              matchType = c.optString("matchType", "contains"),
              value = c.optString("value", ""),
            )
          )
        }
        val actions = mutableListOf<NativeAction>()
        val actArr = obj.optJSONArray("actions") ?: JSONArray()
        for (j in 0 until actArr.length()) {
          val a = actArr.optJSONObject(j) ?: continue
          if (a.optBoolean("enabled", true) == false) continue
          actions.add(
            NativeAction(
              type = a.optString("type", ""),
              params = a.optJSONObject("params") ?: JSONObject(),
            )
          )
        }
        val whitelist = mutableListOf<String>()
        obj.optJSONArray("senderWhitelist")?.let { raw ->
          for (k in 0 until raw.length()) whitelist.add(raw.optString(k, ""))
        }
        val blacklist = mutableListOf<String>()
        obj.optJSONArray("senderBlacklist")?.let { raw ->
          for (k in 0 until raw.length()) blacklist.add(raw.optString(k, ""))
        }
        val tw = obj.optJSONObject("timeWindow")
        val twEnabled = tw?.optBoolean("enabled", false) ?: false
        val twStart = tw?.optString("start", "08:00") ?: "08:00"
        val twEnd = tw?.optString("end", "22:00") ?: "22:00"
        if (obj.optBoolean("enabled", true) && conditions.isNotEmpty() && actions.isNotEmpty()) {
          list.add(
            NativeRule(
              id = obj.optString("id", ""),
              name = obj.optString("name", ""),
              conditions = conditions,
              actions = actions,
              senderWhitelist = whitelist,
              senderBlacklist = blacklist,
              timeWindowEnabled = twEnabled,
              timeWindowStart = twStart,
              timeWindowEnd = twEnd,
            )
          )
        }
      }
      rules = list
      Log.d(TAG, "规则快照已同步: ${list.size} 条")
    } catch (e: Exception) {
      Log.e(TAG, "规则快照解析失败: ${e.message}")
    }
  }

  /** 当前规则快照条数（自诊断页展示） */
  fun rulesCount(): Int = rules.size

  private data class NativeCondition(
    val field: String,
    val matchType: String,
    val value: String,
  )

  private data class NativeAction(
    val type: String,
    val params: JSONObject,
  )

  private data class NativeRule(
    val id: String,
    val name: String,
    val conditions: List<NativeCondition>,
    val actions: List<NativeAction>,
    val senderWhitelist: List<String>,
    val senderBlacklist: List<String>,
    val timeWindowEnabled: Boolean,
    val timeWindowStart: String,
    val timeWindowEnd: String,
  )

  /** 匹配结果：供 JS 记录触发日志 */
  data class NativeMatch(
    val ruleName: String,
    val actionResults: List<Pair<String, Boolean>>,
  )

  /** 号码归一化：去空格/横线/括号，去 +86/0086/86 前缀（与 JS normalizePhone 一致） */
  private fun normalizePhone(raw: String): String {
    var s = raw.trim().replace(Regex("[\\s\\-()]"), "")
    if (s.startsWith("+86") && s.length > 11) s = s.drop(3)
    if (s.startsWith("0086") && s.length > 11) s = s.drop(4)
    if (s.startsWith("86") && s.length > 11) s = s.drop(2)
    return s
  }

  /** 时间窗口判断（支持跨天，start > end 表示跨天；与 JS inTimeWindow 一致） */
  private fun inTimeWindow(start: String, end: String): Boolean {
    fun toMin(t: String): Int {
      val parts = t.split(":")
      return (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 60 + (parts.getOrNull(1)?.toIntOrNull() ?: 0)
    }
    val now = Calendar.getInstance()
    val cur = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    val s = toMin(start)
    val e = toMin(end)
    return if (s <= e) cur >= s && cur <= e else cur >= s || cur <= e
  }

  private fun matchCondition(cond: NativeCondition, sender: String, body: String): Boolean {
    val fieldValue = if (cond.field == "sender") sender else body
    return when (cond.matchType) {
      "contains" -> fieldValue.contains(cond.value)
      "equals" -> fieldValue == cond.value
      "regex" -> try {
        Pattern.compile(cond.value).matcher(fieldValue).find()
      } catch (e: Exception) {
        false
      }
      else -> false
    }
  }

  /**
   * 处理新短信：匹配规则，命中则原生执行动作。
   * @return 命中结果（供 JS 记录日志），未命中返回 null
   */
  fun handleSms(context: Context, sender: String, body: String): NativeMatch? {
    val snapshot = rules
    if (snapshot.isEmpty()) {
      Log.d(TAG, "无规则快照，跳过原生匹配")
      return null
    }
    val matches = snapshot.filter { rule ->
      val senderNorm = normalizePhone(sender)
      // ① 黑名单：命中则排除
      if (rule.senderBlacklist.isNotEmpty() && rule.senderBlacklist.any { normalizePhone(it) == senderNorm }) return@filter false
      // ② 白名单：非空时 sender 必须在名单内
      if (rule.senderWhitelist.isNotEmpty() && rule.senderWhitelist.none { normalizePhone(it) == senderNorm }) return@filter false
      // ③ 时间窗口：窗口外完全静默
      if (rule.timeWindowEnabled && !inTimeWindow(rule.timeWindowStart, rule.timeWindowEnd)) return@filter false
      // ④ 条件（AND）
      rule.conditions.isNotEmpty() && rule.conditions.all { matchCondition(it, sender, body) }
    }
    if (matches.isEmpty()) return null

    Log.d(TAG, "原生命中 ${matches.size} 条规则")
    val results = mutableListOf<Pair<String, Boolean>>()
    for (rule in matches) {
      for (action in rule.actions) {
        val ok = executeAction(context, action)
        results.add(action.type to ok)
      }
    }
    return NativeMatch(
      ruleName = matches.first().name,
      actionResults = results,
    )
  }

  /** 原生执行单个动作 */
  private fun executeAction(context: Context, action: NativeAction): Boolean {
    return try {
      when (action.type) {
        "vibrate" -> executeVibrate(context, action.params)
        "ringtone" -> executeRingtone(context, action.params)
        "notify" -> executeNotify(context, action.params, isWatch = false)
        "pushToWatch" -> executeNotify(context, action.params, isWatch = true)
        else -> {
          Log.w(TAG, "未知动作类型: ${action.type}")
          false
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "动作执行失败 ${action.type}: ${e.message}")
      false
    }
  }

  private fun executeVibrate(context: Context, params: JSONObject): Boolean {
    val vibrator =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      } ?: return false
    if (!vibrator.hasVibrator()) return false

    var pattern = params.optString("pattern", "")
    if (pattern.isBlank() || pattern == "custom") pattern = "300"
    val amplitude = params.optInt("amplitude", 0)
    val amp = if (amplitude in 1..255) amplitude else VibrationEffect.DEFAULT_AMPLITUDE
    val times = pattern.split(",").mapNotNull { it.trim().toLongOrNull() }.toLongArray()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val effect: VibrationEffect =
        if (times.isEmpty()) {
          VibrationEffect.createOneShot(500, amp)
        } else {
          val waveform = if (times.size % 2 == 0) times else times + longArrayOf(1000)
          if (amp == VibrationEffect.DEFAULT_AMPLITUDE) {
            VibrationEffect.createWaveform(waveform, -1)
          } else {
            val amplitudes = IntArray(waveform.size) { amp }
            VibrationEffect.createWaveform(waveform, amplitudes, -1)
          }
        }
      vibrator.vibrate(effect)
    } else {
      @Suppress("DEPRECATION")
      vibrator.vibrate(if (times.isNotEmpty()) times else longArrayOf(500), -1)
    }
    return true
  }

  private fun executeRingtone(context: Context, params: JSONObject): Boolean {
    val source = params.optString("source", "default")
    // 语音播报：系统默认 TTS，播完即止，失败不兜底（不降级响铃）
    if (source == "speech") {
      val speakText = params.optString("speakText", "").trim()
      if (speakText.isEmpty()) return false
      val rate = params.optDouble("rate", 1.0).toFloat()
      val pitch = params.optDouble("pitch", 1.0).toFloat()
      val volume = params.optDouble("volume", 0.0).toFloat() // 0-100，0=当前音量
      return speakViaTts(context, speakText, rate, pitch, volume)
    }
    // 铃声（默认/文件）：原逻辑不变
    val url = params.optString("url", "")
    val durationMs = params.optInt("duration", 0).takeIf { it > 0 } ?: 5000

    stopRingtone()
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    val uri: Uri =
      if (source == "file" && url.isNotBlank()) Uri.parse(url)
      else Settings.System.DEFAULT_ALARM_ALERT_URI

    val mp = MediaPlayer()
    ringtonePlayer = mp
    try {
      if (audioManager != null) {
        audioManager.setStreamVolume(
          AudioManager.STREAM_ALARM,
          audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM),
          0,
        )
      }
      mp.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      mp.setDataSource(context, uri)
      mp.prepare()
      mp.start()
      // 激活 MediaSession + VolumeProvider：音量键路由过来直接停铃（与 RingtoneModule 一致）
      if (audioManager != null) {
        activateRingtoneSession(context, audioManager)
      }
      ringtoneStopRunnable = Runnable { stopRingtone() }
      handler.postDelayed(ringtoneStopRunnable!!, durationMs.toLong())
      return true
    } catch (e: Exception) {
      Log.e(TAG, "铃声播放失败: ${e.message}")
      stopRingtone()
      return false
    }
  }

  /**
   * 锁屏语音播报（异步，不阻塞主线程）：
   * 使用预初始化的复用引擎（initTts），播报异步进行，失败记录日志不兜底。
   * 引擎未就绪（服务刚启动 1-2 秒内收到短信）时本次跳过。
   */
  private fun speakViaTts(context: Context, text: String, rate: Float, pitch: Float, volume: Float): Boolean {
    val engine = ttsEngine
    if (engine == null || !engine.isReady()) {
      Log.e(TAG, "语音播报跳过：TTS 引擎未就绪（预初始化后重试）")
      return false
    }
    engine.speak(text, rate, pitch, volume / 100.0f) { ok ->
      Log.d(TAG, if (ok) "锁屏语音播报完成" else "锁屏语音播报失败")
    }
    return true
  }

  /** 激活 MediaSession + VolumeProvider：系统把音量键路由为回调 → 停止铃声 */
  private fun activateRingtoneSession(context: Context, audioManager: AudioManager) {
    deactivateRingtoneSession()
    val session = MediaSession(context, "FlowKitRingtone")
    session.setPlaybackState(
      PlaybackState.Builder()
        .setActions(0)
        .setState(PlaybackState.STATE_PLAYING, 0, 1.0f)
        .build()
    )
    session.setCallback(object : MediaSession.Callback() {})
    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    val cur = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
    val vp = object : VolumeProvider(VolumeProvider.VOLUME_CONTROL_ABSOLUTE, max, cur) {
      override fun onSetVolumeTo(volume: Int) {
        stopRingtone()
      }

      override fun onAdjustVolume(direction: Int) {
        stopRingtone()
      }
    }
    ringtoneVolumeProvider = vp
    session.setPlaybackToRemote(vp)
    session.isActive = true
    ringtoneSession = session
  }

  private fun deactivateRingtoneSession() {
    ringtoneSession?.let {
      it.isActive = false
      it.release()
    }
    ringtoneSession = null
    ringtoneVolumeProvider = null
  }

  /** 停止并释放当前铃声（MediaSession 音量键回调 / duration 到点调用） */
  private fun stopRingtone() {
    ringtoneStopRunnable?.let { handler.removeCallbacks(it) }
    ringtoneStopRunnable = null
    try {
      if (ringtonePlayer?.isPlaying == true) ringtonePlayer?.stop()
    } catch (_: Exception) {
    }
    try {
      ringtonePlayer?.release()
    } catch (_: Exception) {
    }
    ringtonePlayer = null
    deactivateRingtoneSession()
  }

  private fun executeNotify(context: Context, params: JSONObject, isWatch: Boolean): Boolean {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
    val channelId = if (isWatch) "flowkit-watch-v2" else "flowkit-trigger"
    val channelName = if (isWatch) "手表推送" else "短信触发器"

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val importance =
        if (isWatch) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
      nm.createNotificationChannel(
        NotificationChannel(channelId, channelName, importance)
      )
    }

    val title = if (isWatch) "⌚ " + params.optString("title", "FlowKit 手表提醒") else params.optString("title", "FlowKit 提醒")
    val body = params.optString("body", "收到匹配短信")

    val builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        Notification.Builder(context, channelId)
      } else {
        @Suppress("DEPRECATION")
        Notification.Builder(context)
      }
    val notif = builder
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .setAutoCancel(true)
      .build()

    val notifId = (System.currentTimeMillis() % Int.MAX_VALUE).toInt()
    try {
      nm.notify(notifId, notif)
      return true
    } catch (e: Exception) {
      Log.e(TAG, "通知发送失败: ${e.message}")
      return false
    }
  }
}
