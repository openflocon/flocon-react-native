#if DEBUG
import Foundation
import SQLite3

/// The file operations the Files and Database plugins of Flocon run, on the paths the desktop sends. Debug only.
enum FloconFileSystem {
  private static let fm = FileManager.default

  static func appDirectories() -> [String: String] {
    let documents = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
    let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let caches = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    let library = fm.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    return [
      "documents": documents.path,
      "support": support.path,
      "caches": caches.path,
      "tmp": fm.temporaryDirectory.path,
      "container": documents.deletingLastPathComponent().path,
      "databases": library.appendingPathComponent("LocalDatabase").path,
    ]
  }

  static func list(_ path: String) -> [[String: Any]] {
    guard let names = try? fm.contentsOfDirectory(atPath: path) else { return [] }
    return names.compactMap { name in
      let child = (path as NSString).appendingPathComponent(name)
      guard let attributes = try? fm.attributesOfItem(atPath: child) else { return nil }
      let isDirectory = attributes[.type] as? FileAttributeType == .typeDirectory
      return [
        "name": name,
        "path": child,
        "isDirectory": isDirectory,
        "size": isDirectory ? 0 : (attributes[.size] as? NSNumber)?.doubleValue ?? 0,
        "lastModified": ((attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0) * 1000,
      ]
    }
  }

  static func info(_ path: String) -> [String: Bool] {
    let type = (try? fm.attributesOfItem(atPath: path))?[.type] as? FileAttributeType
    return [
      "exists": type != nil,
      "isDirectory": type == .typeDirectory,
      "isSymbolicLink": type == .typeSymbolicLink,
    ]
  }

  /// Resolves `..` and the symbolic links, also when the file does not exist (its deepest existing parent is).
  static func resolve(_ path: String) -> String {
    let url = URL(fileURLWithPath: path).standardizedFileURL
    if fm.fileExists(atPath: url.path) || (try? fm.attributesOfItem(atPath: url.path)) != nil {
      return url.resolvingSymlinksInPath().path
    }
    let parent = url.deletingLastPathComponent()
    if parent.path == url.path { return url.path }
    return (resolve(parent.path) as NSString).appendingPathComponent(url.lastPathComponent)
  }

  static func size(_ path: String) -> Double {
    guard let enumerator = fm.enumerator(at: URL(fileURLWithPath: path), includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) else { return 0 }
    var total = 0
    for case let url as URL in enumerator {
      let values = try? url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
      if values?.isRegularFile == true { total += values?.fileSize ?? 0 }
    }
    return Double(total)
  }

  /// Deletes a file, a folder and its content, or a symbolic link (not what it points to).
  static func delete(_ path: String) throws {
    if (try? fm.attributesOfItem(atPath: path)) != nil { try fm.removeItem(atPath: path) }
  }

  static func isSqlite(_ path: String) -> Bool {
    guard let handle = FileHandle(forReadingAtPath: path) else { return false }
    defer { try? handle.close() }
    return handle.readData(ofLength: 16) == Data("SQLite format 3\0".utf8)
  }
}

/// Runs the queries of the desktop on a SQLite file, on its own connection: the app may use the same file at the same
/// time. Debug only.
enum FloconSqlite {
  private static let maxBlobBytes = 64
  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  static func execute(path: String, query: String) -> [String: Any?] {
    var db: OpaquePointer?
    defer { sqlite3_close_v2(db) }
    guard sqlite3_open_v2(path, &db, SQLITE_OPEN_READWRITE, nil) == SQLITE_OK else {
      return error(db, fallback: "Cannot open \(path)")
    }
    sqlite3_busy_timeout(db, 2000)
    switch firstWord(query) {
    case "SELECT", "PRAGMA", "EXPLAIN", "WITH":
      return select(db, query)
    case "INSERT":
      guard exec(db, query) else { return error(db, fallback: "Insert failed") }
      return ["type": "Insert", "insertedId": Double(sqlite3_last_insert_rowid(db))]
    case "UPDATE", "DELETE":
      guard exec(db, query) else { return error(db, fallback: "Update failed") }
      return ["type": "UpdateDelete", "affectedCount": Double(sqlite3_changes(db))]
    default:
      guard exec(db, query) else { return error(db, fallback: "Query failed") }
      return ["type": "RawSuccess"]
    }
  }

  private static func exec(_ db: OpaquePointer?, _ query: String) -> Bool {
    sqlite3_exec(db, query, nil, nil, nil) == SQLITE_OK
  }

  private static func select(_ db: OpaquePointer?, _ query: String) -> [String: Any?] {
    var statement: OpaquePointer?
    defer { sqlite3_finalize(statement) }
    guard sqlite3_prepare_v2(db, query, -1, &statement, nil) == SQLITE_OK else { return error(db, fallback: "Invalid query") }
    let count = sqlite3_column_count(statement)
    let columns = (0..<count).map { String(cString: sqlite3_column_name(statement, $0)) }
    var values: [[String?]] = []
    while true {
      let step = sqlite3_step(statement)
      if step == SQLITE_DONE { break }
      guard step == SQLITE_ROW else { return error(db, fallback: "Query failed") }
      values.append((0..<count).map { i in
        switch sqlite3_column_type(statement, i) {
        case SQLITE_NULL:
          return nil
        case SQLITE_BLOB:
          let size = Int(sqlite3_column_bytes(statement, i))
          guard size > 0, let bytes = sqlite3_column_blob(statement, i) else { return "x''" }
          return blob(Data(bytes: bytes, count: size))
        default:
          return sqlite3_column_text(statement, i).map { String(cString: $0) }
        }
      })
    }
    return ["type": "Select", "columns": columns, "values": values]
  }

  private static func error(_ db: OpaquePointer?, fallback: String) -> [String: Any?] {
    let message = db.flatMap { sqlite3_errmsg($0) }.map { String(cString: $0) } ?? fallback
    return ["type": "Error", "message": message]
  }

  private static func firstWord(_ query: String) -> String {
    let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let end = trimmed.firstIndex { $0.isWhitespace || $0 == "(" } ?? trimmed.endIndex
    return trimmed[..<end].uppercased()
  }

  /// A blob is shown as hexadecimal, truncated after `maxBlobBytes` bytes.
  private static func blob(_ data: Data) -> String {
    let hex = { (d: Data) in d.map { String(format: "%02X", $0) }.joined() }
    return data.count > maxBlobBytes
      ? "x'\(hex(data.prefix(maxBlobBytes)))…' (\(data.count) bytes)"
      : "x'\(hex(data))'"
  }
}
#endif
