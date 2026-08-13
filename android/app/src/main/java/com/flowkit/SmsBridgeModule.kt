package com.flowkit

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
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

  companion object {
    const val NAME = "SmsBridge"
    const val EVENT_NAME = "onSmsReceived"

    @Volatile
    private var pendingSms: Pair<String, String>? = null

    private var instance: SmsBridgeModule? = null

    /** 由 SmsReceiver 调用：App 在前台直接发事件，否则缓存待 JS 补发 */
    fun emitSms(sender: String, body: String) {
      pendingSms = sender to body
      instance?.sendEvent(sender, body)
    }
  }

  init {
    instance = this
  }
}
