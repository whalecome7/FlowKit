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
        if (obj.optBoolean("enabled", true) && conditions.isNotEmpty() && actions.isNotEmpty()) {
          list.add(
            NativeRule(
              id = obj.optString("id", ""),
              name = obj.optString("name", ""),
              conditions = conditions,
              actions = actions,
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
  )

  /** 匹配结果：供 JS 记录触发日志 */
  data class NativeMatch(
    val ruleName: String,
    val actionResults: List<Pair<String, Boolean>>,
  )

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
    // 文字播报在部分 ROM 受限，原生兜底仅支持铃声；speech 且无可用 TTS 时播默认铃声
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
