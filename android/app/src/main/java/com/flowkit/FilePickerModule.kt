package com.flowkit

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * 本地文件选择模块（ACTION_OPEN_DOCUMENT）：
 * - 通过系统文档选择器选音频文件，返回 content:// URI；
 * - 持久化读取授权，App 重启后仍可播放该铃声。
 */
class FilePickerModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var pendingPromise: Promise? = null
  private var pendingRequestCode = -1

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "FilePickerModule"

  @ReactMethod
  fun pickAudio(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "当前无活动页面")
      return
    }
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "audio/*"
      flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
    }
    pendingPromise = promise
    pendingRequestCode = (System.currentTimeMillis() % 100000).toInt()
    activity.startActivityForResult(intent, pendingRequestCode)
  }

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?
  ) {
    if (requestCode != pendingRequestCode) return
    val promise = pendingPromise ?: return
    pendingPromise = null
    if (resultCode == Activity.RESULT_OK && data?.data != null) {
      try {
        reactApplicationContext.contentResolver.takePersistableUriPermission(
          data.data!!,
          Intent.FLAG_GRANT_READ_URI_PERMISSION
        )
      } catch (_: Exception) {
        // 某些来源无法持久授权，忽略（会话内仍可用）
      }
      val map = Arguments.createMap()
      map.putString("uri", data.data.toString())
      promise.resolve(map)
    } else {
      promise.reject("CANCELLED", "用户取消")
    }
  }

  override fun onNewIntent(intent: Intent) {}
}
