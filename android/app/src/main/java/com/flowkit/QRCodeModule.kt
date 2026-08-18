package com.flowkit

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import java.io.ByteArrayOutputStream

/**
 * 二维码 PNG 渲染：接收 JS 生成的 QR 矩阵（二维 boolean JSON），
 * 用 Bitmap 绘制并输出 base64 PNG（避免 RN 渲染上万 View 导致闪退）。
 */
class QRCodeModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "QRCodeModule"

  @ReactMethod
  fun render(matrixJson: String, size: Int, callback: Callback) {
    try {
      val matrix = JSONArray(matrixJson)
      val n = matrix.length()
      if (n == 0 || n > 400) {
        callback.invoke(null as String?)
        return
      }
      val scale = maxOf(1, size / n)
      val px = n * scale
      val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      for (r in 0 until n) {
        val row = matrix.optJSONArray(r) ?: continue
        for (c in 0 until n) {
          val dark = row.optBoolean(c)
          if (dark) {
            for (dr in 0 until scale) {
              for (dc in 0 until scale) {
                bitmap.setPixel(r * scale + dr, c * scale + dc, Color.BLACK)
              }
            }
          }
        }
      }
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
      callback.invoke("data:image/png;base64,$b64")
    } catch (e: Exception) {
      Log.e("QRCodeModule", "二维码渲染失败: ${e.message}")
      callback.invoke(null as String?)
    }
  }
}
