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

  /** JS 开始一轮：进入等待，随机延迟后变信号 */
  fun startRound() {
    if (phase == Phase.READY || phase == Phase.WAITING) return
    phase = Phase.WAITING
    invalidate()
    handler.removeCallbacks(readyRunnable)
    handler.postDelayed(readyRunnable, randomDelay())
  }

  /** 停止/重置 */
  fun stop() {
    handler.removeCallbacksAndMessages(null)
    phase = Phase.IDLE
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
        Phase.READY -> COLOR_READY
        Phase.FAULT -> COLOR_FAULT
        Phase.WAITING, Phase.DONE, Phase.IDLE -> COLOR_WAIT
      }
    )
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
  }

  private fun drawTracking(canvas: Canvas) {
    canvas.drawColor(COLOR_BG)
    paint.color = COLOR_READY
    canvas.drawCircle(targetX, targetY, targetRadius, paint)
    paint.color = Color.WHITE
    paint.textSize = targetRadius * 0.8f
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText("点击", targetX, targetY + targetRadius * 0.28f, paint)
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
          phase = Phase.DONE
          invalidate()
          emitResult(dt, false)
        }
      }
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
}
