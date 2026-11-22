package io.github.openflocon.reactnative

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase

/**
 * Runs the queries of the desktop on a SQLite file, on its own connection: the app may use the same file at the same
 * time. Debug only.
 */
internal object FloconSqlite {
  private const val MAX_BLOB_BYTES = 64

  fun execute(path: String, query: String): Map<String, Any?> {
    var db: SQLiteDatabase? = null
    return try {
      db = SQLiteDatabase.openDatabase(path, null, SQLiteDatabase.OPEN_READWRITE)
      when (firstWord(query)) {
        "SELECT", "PRAGMA", "EXPLAIN", "WITH" -> db.rawQuery(query, null).use { select(it) }
        "INSERT" -> {
          db.execSQL(query)
          mapOf("type" to "Insert", "insertedId" to scalar(db, "SELECT last_insert_rowid()"))
        }
        "UPDATE", "DELETE" -> {
          db.execSQL(query)
          mapOf("type" to "UpdateDelete", "affectedCount" to scalar(db, "SELECT changes()"))
        }
        else -> {
          db.execSQL(query)
          mapOf("type" to "RawSuccess")
        }
      }
    } catch (e: Exception) {
      mapOf("type" to "Error", "message" to (e.message ?: e.toString()))
    } finally {
      try {
        db?.close()
      } catch (_: Exception) {
      }
    }
  }

  private fun select(cursor: Cursor): Map<String, Any?> {
    val columns = cursor.columnNames.toList()
    val values = mutableListOf<List<String?>>()
    while (cursor.moveToNext()) {
      values += columns.indices.map { i ->
        when (cursor.getType(i)) {
          Cursor.FIELD_TYPE_NULL -> null
          Cursor.FIELD_TYPE_BLOB -> blob(cursor.getBlob(i))
          else -> cursor.getString(i)
        }
      }
    }
    return mapOf("type" to "Select", "columns" to columns, "values" to values)
  }

  private fun scalar(db: SQLiteDatabase, sql: String): Double =
    db.rawQuery(sql, null).use { if (it.moveToFirst()) it.getLong(0).toDouble() else 0.0 }

  private fun firstWord(query: String): String {
    val trimmed = query.trim()
    val end = trimmed.indexOfFirst { it.isWhitespace() || it == '(' }
    return (if (end < 0) trimmed else trimmed.substring(0, end)).uppercase()
  }

  /** A blob is shown as hexadecimal, truncated after [MAX_BLOB_BYTES] bytes. */
  private fun blob(data: ByteArray): String {
    if (data.isEmpty()) return "x''"
    fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02X".format(it) }
    return if (data.size > MAX_BLOB_BYTES) {
      "x'${hex(data.copyOf(MAX_BLOB_BYTES))}…' (${data.size} bytes)"
    } else {
      "x'${hex(data)}'"
    }
  }
}
