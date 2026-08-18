package com.flowkit

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** FlowKit 自研原生模块包注册 */
class FlowKitPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(
    ContactsModule(reactContext),
    RingtoneModule(reactContext),
    SmsBridgeModule(reactContext),
    VibrationModule(reactContext),
    FilePickerModule(reactContext),
    TtsModule(reactContext),
  )

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
