package io.github.openflocon.reactnative

import android.content.Context
import java.io.File
import java.io.FileInputStream
import java.nio.file.Files
import java.nio.file.LinkOption

/** The file operations the Files and Database plugins of Flocon run, on the paths the desktop sends. Debug only. */
internal object FloconFileSystem {
  private val SQLITE_HEADER = "SQLite format 3\u0000".toByteArray(Charsets.US_ASCII)

  fun appDirectories(context: Context): Map<String, String> {
    val files = context.filesDir
    return mapOf(
      "documents" to files.absolutePath,
      "support" to files.absolutePath,
      "caches" to context.cacheDir.absolutePath,
      "tmp" to context.cacheDir.absolutePath,
      "container" to (files.parentFile ?: files).absolutePath,
      "databases" to context.getDatabasePath("flocon").parentFile!!.absolutePath,
    )
  }

  fun list(path: String): List<Map<String, Any>> {
    val folder = File(path)
    val children = folder.listFiles() ?: return emptyList()
    return children.map { child ->
      val isDirectory = isDirectoryNoFollow(child)
      mapOf(
        "name" to child.name,
        "path" to child.absolutePath,
        "isDirectory" to isDirectory,
        "size" to if (isDirectory) 0.0 else child.length().toDouble(),
        "lastModified" to child.lastModified().toDouble(),
      )
    }
  }

  fun info(path: String): Map<String, Boolean> {
    val file = File(path)
    val link = Files.isSymbolicLink(file.toPath())
    return mapOf(
      "exists" to (link || file.exists()),
      "isDirectory" to isDirectoryNoFollow(file),
      "isSymbolicLink" to link,
    )
  }

  /** Resolves `..` and the symbolic links, also when the file does not exist (its deepest existing parent is). */
  fun resolve(path: String): String = try {
    File(path).canonicalPath
  } catch (e: Exception) {
    File(path).absoluteFile.normalize().path
  }

  fun size(path: String): Double {
    var total = 0L
    File(path).walkTopDown().onEnter { !Files.isSymbolicLink(it.toPath()) }.forEach {
      if (it.isFile && !Files.isSymbolicLink(it.toPath())) total += it.length()
    }
    return total.toDouble()
  }

  /** Deletes a file, a folder and its content, or a symbolic link (not what it points to). */
  fun delete(path: String) {
    val file = File(path)
    if (Files.isSymbolicLink(file.toPath()) || !file.isDirectory) {
      Files.deleteIfExists(file.toPath())
    } else {
      file.listFiles()?.forEach { delete(it.absolutePath) }
      file.delete()
    }
  }

  fun isSqlite(path: String): Boolean = try {
    FileInputStream(path).use { input ->
      val bytes = ByteArray(SQLITE_HEADER.size)
      input.read(bytes) == bytes.size && bytes.contentEquals(SQLITE_HEADER)
    }
  } catch (e: Exception) {
    false
  }

  private fun isDirectoryNoFollow(file: File) = Files.isDirectory(file.toPath(), LinkOption.NOFOLLOW_LINKS)
}
