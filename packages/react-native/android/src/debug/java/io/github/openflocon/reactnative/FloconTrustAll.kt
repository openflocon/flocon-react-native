package io.github.openflocon.reactnative

import android.annotation.SuppressLint
import okhttp3.OkHttpClient
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

/**
 * Accepts the self-signed certificate of the Flocon desktop. Debug builds only: this file is not in the release source
 * set, so a release build never contains it.
 */
internal object FloconTrustAll {
  @SuppressLint("CustomX509TrustManager", "TrustAllX509TrustManager")
  private val trustManager = object : X509TrustManager {
    override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) = Unit
    override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) = Unit
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  fun apply(builder: OkHttpClient.Builder): OkHttpClient.Builder {
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), SecureRandom()) }
    return builder
      .sslSocketFactory(ssl.socketFactory, trustManager)
      .hostnameVerifier { _, _ -> true }
  }
}
