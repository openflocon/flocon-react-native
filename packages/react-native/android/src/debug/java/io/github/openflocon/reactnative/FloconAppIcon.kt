package io.github.openflocon.reactnative

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.min

/** Reads the app icon and encodes it as a base64 PNG, at most [MAX_SIZE] pixels wide. */
internal object FloconAppIcon {
  private const val MAX_SIZE = 300

  fun base64Png(context: Context): String? = try {
    val drawable = context.packageManager.getApplicationIcon(context.packageName)
    val width = drawable.intrinsicWidth.takeIf { it > 0 } ?: MAX_SIZE
    val height = drawable.intrinsicHeight.takeIf { it > 0 } ?: MAX_SIZE
    val scale = min(1f, min(MAX_SIZE.toFloat() / width, MAX_SIZE.toFloat() / height))
    val w = (width * scale).toInt().coerceAtLeast(1)
    val h = (height * scale).toInt().coerceAtLeast(1)
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, w, h)
    drawable.draw(Canvas(bitmap))
    val out = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
    Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  } catch (e: Exception) {
    null
  }
}
