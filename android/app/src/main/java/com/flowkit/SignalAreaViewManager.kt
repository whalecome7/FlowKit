package com.flowkit

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

/** 信号区原生组件管理器（legacy interop：Fabric 下自动兼容） */
class SignalAreaViewManager : SimpleViewManager<SignalAreaView>() {

  override fun getName(): String = "SignalAreaView"

  override fun createViewInstance(reactContext: ThemedReactContext): SignalAreaView =
    SignalAreaView(reactContext)

  @ReactProp(name = "mode")
  fun setMode(view: SignalAreaView, mode: String?) {
    view.setMode(mode ?: SignalAreaView.MODE_REACTION)
  }

  @ReactProp(name = "running")
  fun setRunning(view: SignalAreaView, running: Boolean) {
    if (running) view.startRound() else view.stop()
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "onRoundResult" to mapOf("registrationName" to "onRoundResult"),
      "onContinue" to mapOf("registrationName" to "onContinue"),
    )
  }
}
