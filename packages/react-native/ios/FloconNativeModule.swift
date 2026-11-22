import ExpoModulesCore

#if DEBUG

/// Debug builds: the connection to the Flocon desktop, the identity and the icon of the app, the files of the SDK.
/// Other configurations compile the stub below, without the certificate handling of Flocon.
public class FloconNativeModule: Module {
  private let lock = NSLock()
  private var sockets: [Int: FloconWebSocketClient] = [:]

  public func definition() -> ModuleDefinition {
    Name("FloconNative")
    Constant("isAvailable") { true }
    Events("onMessage", "onClosed")

    AsyncFunction("openWebSocket") { (id: Int, url: String, timeoutMs: Int, promise: Promise) in
      guard let target = URL(string: url) else {
        promise.reject("ERR_FLOCON_CONNECT", "Invalid url \(url)")
        return
      }
      let client = FloconWebSocketClient(
        url: target,
        timeout: TimeInterval(timeoutMs) / 1000,
        onMessage: { [weak self] text in self?.sendEvent("onMessage", ["id": id, "text": text]) },
        onClosed: { [weak self] in
          guard let self, self.remove(id) != nil else { return }
          self.sendEvent("onClosed", ["id": id])
        }
      )
      self.put(id, client)
      client.open { error in
        if let error {
          _ = self.remove(id)
          promise.reject("ERR_FLOCON_CONNECT", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    Function("send") { (id: Int, text: String) -> Bool in
      self.get(id)?.send(text) ?? false
    }

    AsyncFunction("close") { (id: Int) in
      self.remove(id)?.close()
    }

    AsyncFunction("upload") { (url: String, filePath: String, fileName: String, fields: [String: String], promise: Promise) in
      FloconUploader.upload(url: url, filePath: filePath, fileName: fileName, fields: fields) { error in
        if let error { promise.reject("ERR_FLOCON_UPLOAD", error.localizedDescription) } else { promise.resolve(nil) }
      }
    }

    AsyncFunction("appInfos") { () -> [String: String] in
      await MainActor.run { FloconAppInfos.current() }
    }

    AsyncFunction("appIconBase64Png") { () -> String? in
      FloconAppIcon.base64Png()
    }

    AsyncFunction("readStorageFile") { (name: String) -> String? in
      let file = try FloconStorage.file(name)
      return FileManager.default.fileExists(atPath: file.path) ? try String(contentsOf: file, encoding: .utf8) : nil
    }

    AsyncFunction("writeStorageFile") { (name: String, content: String) in
      try content.write(to: try FloconStorage.file(name), atomically: true, encoding: .utf8)
    }

    AsyncFunction("deleteStorageFile") { (name: String) in
      let file = try FloconStorage.file(name)
      if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    }

    AsyncFunction("appDirectories") { () -> [String: String] in FloconFileSystem.appDirectories() }
    AsyncFunction("listDirectory") { (path: String) -> [[String: Any]] in FloconFileSystem.list(path) }
    AsyncFunction("fileInfo") { (path: String) -> [String: Bool] in FloconFileSystem.info(path) }
    AsyncFunction("resolvePath") { (path: String) -> String in FloconFileSystem.resolve(path) }
    AsyncFunction("directorySize") { (path: String) -> Double in FloconFileSystem.size(path) }
    AsyncFunction("deleteItem") { (path: String) in try FloconFileSystem.delete(path) }
    AsyncFunction("isSqlite") { (path: String) -> Bool in FloconFileSystem.isSqlite(path) }
    AsyncFunction("sqliteExecute") { (path: String, query: String) -> [String: Any?] in
      FloconSqlite.execute(path: path, query: query)
    }

    // The JavaScript reloads (Fast Refresh, `r` in Metro) but the native side stays: close the sockets of the previous
    // JavaScript, or the desktop would show the app twice.
    OnDestroy {
      self.closeAll()
    }
  }

  private func put(_ id: Int, _ client: FloconWebSocketClient) {
    lock.lock(); defer { lock.unlock() }
    sockets[id] = client
  }

  private func get(_ id: Int) -> FloconWebSocketClient? {
    lock.lock(); defer { lock.unlock() }
    return sockets[id]
  }

  private func remove(_ id: Int) -> FloconWebSocketClient? {
    lock.lock(); defer { lock.unlock() }
    return sockets.removeValue(forKey: id)
  }

  private func closeAll() {
    lock.lock()
    let all = Array(sockets.values)
    sockets.removeAll()
    lock.unlock()
    all.forEach { $0.close() }
  }
}

#else

/// Release builds: Flocon is off. The JavaScript of Flocon sees `isAvailable == false` and does not start.
public class FloconNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FloconNative")
    Constant("isAvailable") { false }
    Events("onMessage", "onClosed")
    AsyncFunction("openWebSocket") { (_: Int, _: String, _: Int) in throw FloconUnavailable() }
    Function("send") { (_: Int, _: String) -> Bool in false }
    AsyncFunction("close") { (_: Int) in }
    AsyncFunction("upload") { (_: String, _: String, _: String, _: [String: String]) in throw FloconUnavailable() }
    AsyncFunction("appInfos") { () -> [String: String] in throw FloconUnavailable() }
    AsyncFunction("appIconBase64Png") { () -> String? in nil }
    AsyncFunction("readStorageFile") { (_: String) -> String? in throw FloconUnavailable() }
    AsyncFunction("writeStorageFile") { (_: String, _: String) in throw FloconUnavailable() }
    AsyncFunction("deleteStorageFile") { (_: String) in throw FloconUnavailable() }
    AsyncFunction("appDirectories") { () -> [String: String] in throw FloconUnavailable() }
    AsyncFunction("listDirectory") { (_: String) -> [[String: Any]] in throw FloconUnavailable() }
    AsyncFunction("fileInfo") { (_: String) -> [String: Bool] in throw FloconUnavailable() }
    AsyncFunction("resolvePath") { (_: String) -> String in throw FloconUnavailable() }
    AsyncFunction("directorySize") { (_: String) -> Double in throw FloconUnavailable() }
    AsyncFunction("deleteItem") { (_: String) in throw FloconUnavailable() }
    AsyncFunction("isSqlite") { (_: String) -> Bool in throw FloconUnavailable() }
    AsyncFunction("sqliteExecute") { (_: String, _: String) -> [String: Any?] in throw FloconUnavailable() }
  }
}

final class FloconUnavailable: Exception, @unchecked Sendable {
  override var reason: String { "Flocon is not available in release builds" }
}

#endif
