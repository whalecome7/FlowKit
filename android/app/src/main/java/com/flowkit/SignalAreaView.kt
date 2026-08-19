package com.flowkit

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import kotlin.random.Random

/**
 * 反应力测试信号区（原生组件）：
 * - 三模式：REACTION（全屏色块红→绿）/ SEQUENCE（2×2 高亮格）/ TRACKING（目标跳位）
 * - 计时闭环：t0=原生变色时刻(uptimeMillis)，t1=MotionEvent.eventTime，同源时钟
 * - 状态机：IDLE → WAITING（随机延迟）→ READY（信号出现+t0）→ 触摸后 DONE/FAULT
 */
class SignalAreaView(context: Context) : View(context) {

  companion object {
    const val MODE_REACTION = "reaction"
    const val MODE_SEQUENCE = "sequence"
    const val MODE_TRACKING = "tracking"

    const val COLOR_WAIT = 0xFF8D8D8D.toInt()
    const val COLOR_READY = 0xFF30A46C.toInt()
    const val COLOR_FAULT = 0xFFE5484D.toInt()
    const val COLOR_BG = 0xFF1A1A1A.toInt()
    const val COLOR_CELL_BORDER = 0xFF333333.toInt()
  }

  enum class Phase { IDLE, WAITING, READY, DONE, FAULT }

  private val handler = Handler(Looper.getMainLooper())
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

  @Volatile private var mode = MODE_REACTION
  @Volatile var phase: Phase = Phase.IDLE
    private set
  private var t0 = 0L
  private var lastTimeMs = 0L           // 最近一轮成绩（状态文字显示）
  private var highlightIndex = 0      // SEQUENCE 高亮格（0-3）
  private var targetX = 0f             // TRACKING 目标圆心
  private var targetY = 0f
  private var targetRadius = 0f

  private val randomDelay = { Random.nextLong(2000L, 5000L) }

  private val readyRunnable = Runnable {
    phase = Phase.READY
    t0 = SystemClock.uptimeMillis()
    invalidate()
  }

  /** JS 设置模式（游戏开始前） */
  fun setMode(newMode: String) {
    mode = newMode
    phase = Phase.IDLE
    handler.removeCallbacksAndMessages(null)
    invalidate()
  }

  /** JS 开始一轮：每轮随机高亮格/目标位置，进入等待，随机延迟后变信号 */
  fun startRound() {
    if (phase == Phase.READY || phase == Phase.WAITING) return
    // 每轮随机：序列模式随机高亮格，追踪模式随机目标位置（修复固定第一格/固定位置 bug）
    if (mode == MODE_SEQUENCE) highlightIndex = Random.nextInt(4)
    if (mode == MODE_TRACKING) randomizeTarget()
    phase = Phase.WAITING
    invalidate()
    handler.removeCallbacks(readyRunnable)
    handler.postDelayed(readyRunnable, randomDelay())
  }

  /** 停止计时（每轮后复位定时器）。不重置 phase：保持 DONE/FAULT 显示（成绩/继续引导），
   *  避免色块闪回初始灰态覆盖成绩文字；切模式由 setMode 重置 IDLE */
  fun stop() {
    handler.removeCallbacksAndMessages(null)
    invalidate()
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    targetRadius = minOf(w, h) * 0.09f
    randomizeTarget()
  }

  private fun randomizeTarget() {
    val r = targetRadius
    if (r <= 0f) return
    targetX = r + Random.nextFloat() * (width - 2 * r)
    targetY = r + Random.nextFloat() * (height - 2 * r)
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    when (mode) {
      MODE_REACTION -> drawReaction(canvas)
      MODE_SEQUENCE -> drawSequence(canvas)
      MODE_TRACKING -> drawTracking(canvas)
    }
  }

  private fun drawReaction(canvas: Canvas) {
    canvas.drawColor(
      when (phase) {
        Phase.IDLE -> COLOR_WAIT               // 初始：灰
        Phase.WAITING -> COLOR_FAULT           // 等待：红
        Phase.READY, Phase.DONE -> COLOR_READY // 信号+完成：绿（完成保持绿，避免红→绿→红闪变刺眼）
        Phase.FAULT -> COLOR_WAIT              // 失误：灰
      }
    )
    drawStatusText(canvas)
  }

  private fun drawSequence(canvas: Canvas) {
    canvas.drawColor(COLOR_BG)
    val gap = (minOf(width, height) * 0.03f).toInt()
    val cw = (width - gap * 3) / 2
    val ch = (height - gap * 3) / 2
    for (i in 0 until 4) {
      val row = i / 2
      val col = i % 2
      val l = gap + col * (cw + gap)
      val t = gap + row * (ch + gap)
      val isHighlight = phase == Phase.READY && i == highlightIndex
      paint.color = if (isHighlight) COLOR_READY else COLOR_WAIT
      canvas.drawRect(l.toFloat(), t.toFloat(), (l + cw).toFloat(), (t + ch).toFloat(), paint)
    }
    drawStatusText(canvas)
  }

  private fun drawTracking(canvas: Canvas) {
    canvas.drawColor(COLOR_BG)
    paint.color = COLOR_READY
    canvas.drawCircle(targetX, targetY, targetRadius, paint)
    paint.color = Color.WHITE
    paint.textSize = targetRadius * 0.8f
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText("点击", targetX, targetY + targetRadius * 0.28f, paint)
    drawStatusText(canvas)
  }

  /** 状态引导文字：IDLE 点击开始 / DONE 点击继续 / FAULT 失误点击继续 */
  private fun drawStatusText(canvas: Canvas) {
    val text = when (phase) {
      Phase.IDLE -> "⚡ 点击开始"
      Phase.DONE -> "本轮 $lastTimeMs ms · 点击继续"
      Phase.FAULT -> "失误 · 点击继续"
      else -> null
    } ?: return
    paint.color = Color.WHITE
    paint.textSize = minOf(width, height) * 0.055f
    paint.textAlign = Paint.Align.CENTER
    paint.isFakeBoldText = true
    canvas.drawText(text, width / 2f, height / 2f + paint.textSize * 0.35f, paint)
    paint.isFakeBoldText = false
  }

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action != MotionEvent.ACTION_DOWN) return true
    when (phase) {
      Phase.WAITING -> {
        phase = Phase.FAULT
        invalidate()
        emitResult(0L, true)
      }
      Phase.READY -> {
        val dt = event.eventTime - t0
        val ok = when (mode) {
          MODE_SEQUENCE -> hitSequence(event.x, event.y)
          MODE_TRACKING -> hitTarget(event.x, event.y)
          else -> true
        }
        if (!ok) {
          phase = Phase.FAULT
          invalidate()
          emitResult(dt, true)
        } else {
          lastTimeMs = dt
          phase = Phase.DONE
          invalidate()
          emitResult(dt, false)
        }
      }
      // 点击继续：IDLE（第一轮开始）/ DONE / FAULT（下一轮）→ 通知 JS
      Phase.IDLE, Phase.DONE, Phase.FAULT -> emitContinue()
      else -> Unit
    }
    return true
  }

  private fun hitSequence(x: Float, y: Float): Boolean {
    val gap = (minOf(width, height) * 0.03f).toInt()
    val cw = (width - gap * 3) / 2
    val ch = (height - gap * 3) / 2
    val row = highlightIndex / 2
    val col = highlightIndex % 2
    val l = gap + col * (cw + gap)
    val t = gap + row * (ch + gap)
    return x >= l && x <= l + cw && y >= t && y <= t + ch
  }

  private fun hitTarget(x: Float, y: Float): Boolean {
    val dx = x - targetX
    val dy = y - targetY
    return dx * dx + dy * dy <= targetRadius * targetRadius * 1.2f
  }

  /** 每轮完成后自动准备下一轮（随机高亮格/目标位置） */
  fun prepareNextRoundAuto() {
    if (mode == MODE_SEQUENCE) highlightIndex = Random.nextInt(4)
    if (mode == MODE_TRACKING) randomizeTarget()
    phase = Phase.IDLE
    invalidate()
  }

  private fun emitResult(timeMs: Long, isFault: Boolean) {
    val ctx = context
    if (ctx !is ReactContext || id == View.NO_ID) return
    val map: WritableMap = Arguments.createMap()
    map.putDouble("timeMs", timeMs.toDouble())
    map.putBoolean("isFault", isFault)
    ctx.getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "onRoundResult", map)
  }

  /** 用户点击「开始/继续」（IDLE 第一轮 / DONE / FAULT 下一轮） */
  private fun emitContinue() {
    val ctx = context
    if (ctx !is ReactContext || id == View.NO_ID) return
    ctx.getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "onContinue", Arguments.createMap())
  }
}
