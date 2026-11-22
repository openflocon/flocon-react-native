#if DEBUG
import UIKit

/// Uploads a file to the HTTP server of the desktop, as `multipart/form-data` (the fields, then `file`).
enum FloconUploader {
  private static let session = URLSession(configuration: .ephemeral, delegate: FloconTrustAllDelegate(), delegateQueue: nil)

  static func upload(url: String, filePath: String, fileName: String, fields: [String: String], completion: @escaping (Error?) -> Void) {
    guard let target = URL(string: url) else { return completion(URLError(.badURL)) }
    let source = filePath.hasPrefix("file://") ? URL(string: filePath)! : URL(fileURLWithPath: filePath)
    let boundary = "Flocon-\(UUID().uuidString)"
    let body = FileManager.default.temporaryDirectory.appendingPathComponent("flocon-upload-\(UUID().uuidString)")
    do {
      FileManager.default.createFile(atPath: body.path, contents: nil)
      let out = try FileHandle(forWritingTo: body)
      var head = ""
      for (name, value) in fields {
        head += "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n"
      }
      let safeName = fileName.replacingOccurrences(of: "\"", with: "_")
      head += "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\n"
      head += "Content-Type: application/octet-stream\r\n\r\n"
      out.write(Data(head.utf8))
      let input = try FileHandle(forReadingFrom: source)
      while case let chunk = input.readData(ofLength: 1 << 20), !chunk.isEmpty { out.write(chunk) }
      try input.close()
      out.write(Data("\r\n--\(boundary)--\r\n".utf8))
      try out.close()
    } catch {
      try? FileManager.default.removeItem(at: body)
      return completion(error)
    }
    var request = URLRequest(url: target, timeoutInterval: 30)
    request.httpMethod = "POST"
    request.setValue("Flocon", forHTTPHeaderField: "User-Agent")
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    session.uploadTask(with: request, fromFile: body) { _, response, error in
      try? FileManager.default.removeItem(at: body)
      if let error { return completion(error) }
      let code = (response as? HTTPURLResponse)?.statusCode ?? 0
      completion((200..<300).contains(code) ? nil : URLError(.badServerResponse))
    }.resume()
  }
}

/// Identity of the app and device, sent with every message.
enum FloconAppInfos {
  @MainActor
  static func current() -> [String: String] {
    let info = Bundle.main.infoDictionary ?? [:]
    let name = (info["CFBundleDisplayName"] as? String) ?? (info["CFBundleName"] as? String) ?? "unknown"
    return [
      "deviceId": UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString,
      "deviceName": UIDevice.current.name,
      "platform": "ios",
      "appName": name,
      "appPackageName": Bundle.main.bundleIdentifier ?? "unknown",
    ]
  }
}

/// The files of the SDK that must survive a restart, in `Application Support/flocon`.
enum FloconStorage {
  static func file(_ name: String) throws -> URL {
    guard name.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else {
      throw URLError(.badURL)
    }
    let dir = try FileManager.default
      .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("flocon", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent(name)
  }
}

/// Reads the app icon and encodes it as a base64 PNG, at most 300 pixels wide.
enum FloconAppIcon {
  private static let maxSize: CGFloat = 300

  static func base64Png() -> String? {
    guard let image = appIcon() else { return nil }
    // in pixels: a 60 points icon is 120 pixels at @2x
    let pixelWidth = image.size.width * image.scale
    let pixelHeight = image.size.height * image.scale
    let scale = min(maxSize / pixelWidth, maxSize / pixelHeight, 1)
    let size = CGSize(width: (pixelWidth * scale).rounded(), height: (pixelHeight * scale).rounded())
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    return resized.pngData()?.base64EncodedString()
  }

  /// iOS has no API that returns the app icon: its file names are listed under `CFBundleIcons`.
  private static func appIcon() -> UIImage? {
    let info = Bundle.main.infoDictionary
    let primary = (info?["CFBundleIcons"] as? [String: Any])?["CFBundlePrimaryIcon"] as? [String: Any]
    var names: [String] = []
    if let name = primary?["CFBundleIconName"] as? String { names.append(name) }
    names += (primary?["CFBundleIconFiles"] as? [String]) ?? []
    return names
      .compactMap { UIImage(named: $0) }
      .max { $0.size.width * $0.scale < $1.size.width * $1.scale }
  }
}
#endif
