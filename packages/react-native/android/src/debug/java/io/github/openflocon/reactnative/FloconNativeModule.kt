package io.github.openflocon.reactnative

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Debug builds: the connection to the Flocon desktop, the identity and the icon of the app, the files of the SDK.
 * The release source set has a stub with the same API.
 */
class FloconNativeModule : Module() {
  private val sockets = ConcurrentHashMap<Int, FloconWebSocketClient>()

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw CodedException("ERR_FLOCON_NO_CONTEXT", "No context", null)

  override fun definition() = ModuleDefinition {
    Name("FloconNative")
    Constant("isAvailable") { true }
    Events("onMessage", "onClosed")

    AsyncFunction("openWebSocket") { id: Int, url: String, timeoutMs: Int, promise: Promise ->
      val client = FloconWebSocketClient(
        url = url,
        timeoutMs = timeoutMs.toLong(),
        onMessage = { text -> sendEvent("onMessage", mapOf("id" to id, "text" to text)) },
        onClosed = {
          if (sockets.remove(id) != null) sendEvent("onClosed", mapOf("id" to id))
        },
      )
      sockets[id] = client
      client.open(
        onOpen = { promise.resolve(null) },
        onFailure = { error ->
          sockets.remove(id)
          promise.reject(CodedException("ERR_FLOCON_CONNECT", error.message ?: "Cannot connect to $url", error))
        },
      )
    }

    Function("send") { id: Int, text: String -> sockets[id]?.send(text) ?: false }

    AsyncFunction("close") { id: Int ->
      sockets.remove(id)?.close()
      Unit
    }

    AsyncFunction("upload") { url: String, filePath: String, fileName: String, fields: Map<String, String> ->
      FloconUploader.upload(url, File(filePath.removePrefix("file://")), fileName, fields)
    }

    AsyncFunction("appInfos") { appInfos() }

    AsyncFunction("appIconBase64Png") { FloconAppIcon.base64Png(context) }

    AsyncFunction("readStorageFile") { name: String ->
      val file = storageFile(name)
      if (file.exists()) file.readText() else null
    }

    AsyncFunction("writeStorageFile") { name: String, content: String ->
      storageFile(name).writeText(content)
    }

    AsyncFunction("deleteStorageFile") { name: String ->
      storageFile(name).delete()
      Unit
    }

    AsyncFunction("appDirectories") { FloconFileSystem.appDirectories(context) }
    AsyncFunction("listDirectory") { path: String -> FloconFileSystem.list(path) }
    AsyncFunction("fileInfo") { path: String -> FloconFileSystem.info(path) }
    AsyncFunction("resolvePath") { path: String -> FloconFileSystem.resolve(path) }
    AsyncFunction("directorySize") { path: String -> FloconFileSystem.size(path) }
    AsyncFunction("deleteItem") { path: String ->
      FloconFileSystem.delete(path)
      Unit
    }
    AsyncFunction("isSqlite") { path: String -> FloconFileSystem.isSqlite(path) }
    AsyncFunction("sqliteExecute") { path: String, query: String -> FloconSqlite.execute(path, query) }

    // The JavaScript reloads (Fast Refresh, `r` in Metro) but the module stays: close the sockets of the previous
    // JavaScript, or the desktop would show the app twice.
    OnDestroy { closeAll() }
  }

  private fun closeAll() {
    val all = sockets.values.toList()
    sockets.clear()
    all.forEach { it.close() }
  }

  @SuppressLint("HardwareIds")
  private fun appInfos(): Map<String, String> {
    val context = context
    val packageManager = context.packageManager
    val appName = try {
      packageManager.getApplicationLabel(context.applicationInfo).toString()
    } catch (e: Exception) {
      "unknown"
    }
    return mapOf(
      "deviceId" to (Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"),
      "deviceName" to "${Build.MANUFACTURER} ${Build.MODEL}",
      "platform" to "android",
      "appName" to appName.ifEmpty { "unknown" },
      "appPackageName" to context.packageName,
    )
  }

  private fun storageFile(name: String): File {
    if (!NAME.matches(name)) throw CodedException("ERR_FLOCON_FILE_NAME", "Invalid file name: $name", null)
    val dir = File(context.noBackupFilesDir, "flocon").apply { mkdirs() }
    return File(dir, name)
  }

  private companion object {
    val NAME = Regex("[A-Za-z0-9._-]+")
  }
}
