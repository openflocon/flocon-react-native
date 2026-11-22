package io.github.openflocon.reactnative

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Release builds: Flocon is off. The JavaScript of Flocon sees `isAvailable == false` and does not start; the code that
 * connects to the desktop (and accepts its self-signed certificate) is only in the debug source set.
 */
class FloconNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FloconNative")
    Constant("isAvailable") { false }
    Events("onMessage", "onClosed")
    AsyncFunction("openWebSocket") { _: Int, _: String, _: Int -> unavailable<Unit>() }
    Function("send") { _: Int, _: String -> false }
    AsyncFunction("close") { _: Int -> }
    AsyncFunction("upload") { _: String, _: String, _: String, _: Map<String, String> -> unavailable<Unit>() }
    AsyncFunction("appInfos") { unavailable<Unit>() }
    AsyncFunction("appIconBase64Png") { null as String? }
    AsyncFunction("readStorageFile") { _: String -> unavailable<Unit>() }
    AsyncFunction("writeStorageFile") { _: String, _: String -> unavailable<Unit>() }
    AsyncFunction("deleteStorageFile") { _: String -> unavailable<Unit>() }
    AsyncFunction("appDirectories") { unavailable<Unit>() }
    AsyncFunction("listDirectory") { _: String -> unavailable<Unit>() }
    AsyncFunction("fileInfo") { _: String -> unavailable<Unit>() }
    AsyncFunction("resolvePath") { _: String -> unavailable<Unit>() }
    AsyncFunction("directorySize") { _: String -> unavailable<Unit>() }
    AsyncFunction("deleteItem") { _: String -> unavailable<Unit>() }
    AsyncFunction("isSqlite") { _: String -> unavailable<Unit>() }
    AsyncFunction("sqliteExecute") { _: String, _: String -> unavailable<Unit>() }
  }

  private fun <T> unavailable(): T =
    throw CodedException("ERR_FLOCON_UNAVAILABLE", "Flocon is not available in release builds", null)
}
