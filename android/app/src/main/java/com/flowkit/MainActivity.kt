package com.flowkit

import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "FlowKit"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * 铃声提醒响起时，按音量减小键可停止铃声（消费事件，不再调音量）。
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (
      event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN &&
      event.action == KeyEvent.ACTION_DOWN &&
      RingtoneModule.isPlaying()
    ) {
      RingtoneModule.stopPlaying()
      return true
    }
    return super.dispatchKeyEvent(event)
  }
}
