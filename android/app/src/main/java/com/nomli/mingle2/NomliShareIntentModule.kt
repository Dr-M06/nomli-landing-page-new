package com.nomli.mingle2

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class NomliShareIntentModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NomliShareIntent"

  @ReactMethod
  fun consumePendingShare(promise: Promise) {
    try {
      val f = File(reactApplicationContext.cacheDir, ShareIntentProcessor.PENDING_FILE_NAME)
      if (!f.exists()) {
        promise.resolve(null)
        return
      }
      val json = f.readText(Charsets.UTF_8)
      if (!f.delete()) {
        f.deleteOnExit()
      }
      promise.resolve(json)
    } catch (e: Exception) {
      promise.reject("E_NOMLI_SHARE", e.message, e)
    }
  }
}
