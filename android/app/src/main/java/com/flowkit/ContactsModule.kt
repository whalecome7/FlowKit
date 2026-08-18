package com.flowkit

import android.Manifest
import android.content.pm.PackageManager
import android.database.Cursor
import android.provider.ContactsContract
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

/** 通讯录查询：返回 [{ name, phones: [] }]（仅含手机号），供黑白名单多选 */
class ContactsModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ContactsModule"

  @ReactMethod
  fun getContacts(promise: Promise) {
    val granted = reactContext.checkSelfPermission(Manifest.permission.READ_CONTACTS) ==
      PackageManager.PERMISSION_GRANTED
    if (!granted) {
      promise.reject("PERMISSION_DENIED", "READ_CONTACTS 未授权")
      return
    }
    try {
      val results = Arguments.createArray()
      val map = LinkedHashMap<String, MutableList<String>>()
      val resolver = reactContext.contentResolver
      val cursor: Cursor? = resolver.query(
        ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
        arrayOf(
          ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
          ContactsContract.CommonDataKinds.Phone.NUMBER
        ),
        null, null,
        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " COLLATE LOCALIZED ASC"
      )
      cursor?.use { c ->
        val nameIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
        val numIdx = c.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
        while (c.moveToNext()) {
          val name = c.getString(nameIdx) ?: ""
          val number = c.getString(numIdx) ?: ""
          if (number.isNotBlank()) {
            map.getOrPut(name) { mutableListOf() }.add(number)
          }
        }
      }
      for ((name, phones) in map) {
        val entry = Arguments.createMap()
        entry.putString("name", name)
        val arr = Arguments.createArray()
        phones.forEach { arr.pushString(it) }
        entry.putArray("phones", arr)
        results.pushMap(entry)
      }
      promise.resolve(results)
    } catch (e: Exception) {
      promise.reject("QUERY_FAILED", e.message ?: "查询通讯录失败")
    }
  }

  /** JS 请求权限后调用：请求 READ_CONTACTS 并回调结果 */
  @ReactMethod
  fun requestPermission(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity is PermissionAwareActivity) {
      activity.requestPermissions(
        arrayOf(Manifest.permission.READ_CONTACTS),
        9001,
        object : PermissionListener {
          override fun onRequestPermissionsResult(
            requestCode: Int,
            permissions: Array<String>,
            grantResults: IntArray
          ): Boolean {
            val ok = grantResults.isNotEmpty() &&
              grantResults[0] == PackageManager.PERMISSION_GRANTED
            if (ok) promise.resolve(true) else promise.reject("DENIED", "用户拒绝")
            return true
          }
        }
      )
    } else {
      promise.reject("NO_ACTIVITY", "无 Activity 可发起权限请求")
    }
  }
}
