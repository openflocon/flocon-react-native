package io.github.openflocon.reactnative

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Uploads a file to the HTTP server of the desktop, as `multipart/form-data` (the fields, then `file`). */
internal object FloconUploader {
  private val client by lazy {
    FloconTrustAll.apply(OkHttpClient.Builder()).connectTimeout(10, TimeUnit.SECONDS).build()
  }

  fun upload(url: String, file: File, fileName: String, fields: Map<String, String>) {
    val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
      fields.forEach { (name, value) -> addFormDataPart(name, value) }
      addFormDataPart("file", fileName.replace("\"", "_"), file.asRequestBody("application/octet-stream".toMediaType()))
    }.build()
    val request = Request.Builder().url(url).header("User-Agent", "Flocon").post(body).build()
    client.newCall(request).execute().use { response ->
      if (!response.isSuccessful) throw IOException("Upload failed: HTTP ${response.code}")
    }
  }
}
