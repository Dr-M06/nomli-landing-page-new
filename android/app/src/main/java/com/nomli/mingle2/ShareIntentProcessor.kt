package com.nomli.mingle2

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.MimeTypeMap
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Handles ACTION_SEND / SEND_MULTIPLE: copies content:// (and file://) into app cache,
 * then writes [nomli_share_pending.json] for JS to consume via NomliShareIntentModule.
 */
object ShareIntentProcessor {
  private const val TAG = "ShareIntent"
  const val PENDING_FILE_NAME = "nomli_share_pending.json"
  private const val IMPORT_SUBDIR = "share_import"

  fun processIntent(context: Context, intent: Intent?) {
    if (intent == null) return
    val action = intent.action ?: return
    if (action != Intent.ACTION_SEND && action != Intent.ACTION_SEND_MULTIPLE) {
      return
    }

    try {
      val images = mutableListOf<String>()
      val videos = mutableListOf<String>()
      val importDir = File(context.cacheDir, IMPORT_SUBDIR).apply { mkdirs() }

      if (action == Intent.ACTION_SEND_MULTIPLE) {
        val list = getParcelableUriArrayList(intent, Intent.EXTRA_STREAM)
        list?.forEach { uri -> copyUriToCache(context, uri, importDir, images, videos) }
      } else {
        val stream = getParcelableUriExtra(intent, Intent.EXTRA_STREAM)
        if (stream != null) {
          copyUriToCache(context, stream, importDir, images, videos)
        }
        if (stream == null) {
          val clip = intent.clipData
          if (clip != null) {
            for (i in 0 until clip.itemCount) {
              val uri = clip.getItemAt(i).uri
              if (uri != null) copyUriToCache(context, uri, importDir, images, videos)
            }
          }
        }
      }

      val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
      var url = ""
      if (text.isNotEmpty()) {
        val firstLine = text.lines().first().trim()
        if (firstLine.startsWith("http://") || firstLine.startsWith("https://")) {
          url = firstLine
        }
      }

      val imagesOut = images.take(4)
      val videosOut = videos.take(1)

      if (imagesOut.isEmpty() && videosOut.isEmpty() && text.isEmpty()) {
        return
      }

      val root = JSONObject()
      if (imagesOut.isNotEmpty()) root.put("images", JSONArray(imagesOut))
      if (videosOut.isNotEmpty()) root.put("videos", JSONArray(videosOut))
      if (text.isNotEmpty()) root.put("text", text)
      if (url.isNotEmpty()) root.put("url", url)

      File(context.cacheDir, PENDING_FILE_NAME).writeText(root.toString(), Charsets.UTF_8)
      Log.i(TAG, "Wrote share pending: images=${imagesOut.size} videos=${videosOut.size} text=${text.isNotEmpty()}")
    } catch (e: Exception) {
      Log.e(TAG, "processIntent failed", e)
    }
  }

  private fun getParcelableUriExtra(intent: Intent, key: String): Uri? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(key, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(key)
    }
  }

  private fun getParcelableUriArrayList(intent: Intent, key: String): ArrayList<Uri>? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableArrayListExtra(key, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra(key)
    }
  }

  private fun copyUriToCache(
    context: Context,
    uri: Uri,
    importDir: File,
    images: MutableList<String>,
    videos: MutableList<String>,
  ) {
    val cr = context.contentResolver
    val mime = cr.getType(uri) ?: ""
    val ext = extensionForMime(mime, uri)
    val outFile = File(importDir, "${UUID.randomUUID()}.$ext")
    try {
      cr.openInputStream(uri)?.use { input ->
        FileOutputStream(outFile).use { output -> input.copyTo(output) }
      } ?: run {
        Log.w(TAG, "openInputStream null for $uri")
        return
      }
      val fileUri = "file://${outFile.absolutePath}"
      when {
        mime.startsWith("video/") -> videos.add(fileUri)
        mime.startsWith("image/") -> images.add(fileUri)
        else -> classifyByExtension(fileUri, ext, images, videos)
      }
    } catch (e: Exception) {
      Log.e(TAG, "copyUriToCache failed for $uri", e)
    }
  }

  private fun extensionForMime(mime: String, uri: Uri): String {
    if (mime.isNotEmpty()) {
      MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)?.let { return it }
    }
    val path = uri.path ?: ""
    val dot = path.lastIndexOf('.')
    if (dot >= 0 && dot < path.length - 1) {
      return path.substring(dot + 1).lowercase().take(8)
    }
    return "bin"
  }

  private fun classifyByExtension(
    fileUri: String,
    ext: String,
    images: MutableList<String>,
    videos: MutableList<String>,
  ) {
    when (ext.lowercase()) {
      in listOf("mp4", "mov", "m4v", "webm", "mkv", "avi", "3gp") -> videos.add(fileUri)
      in listOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif") -> images.add(fileUri)
      else -> images.add(fileUri)
    }
  }
}
