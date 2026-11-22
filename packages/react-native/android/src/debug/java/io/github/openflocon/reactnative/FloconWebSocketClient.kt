package io.github.openflocon.reactnative

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * A `wss://` connection to the desktop app. The desktop serves a self-signed certificate: the connection is encrypted,
 * but the certificate is not verified (so the app needs no cleartext traffic exception). Debug builds only.
 */
internal class FloconWebSocketClient(
  private val url: String,
  private val timeoutMs: Long,
  private val onMessage: (String) -> Unit,
  private val onClosed: () -> Unit,
) {
  private val client: OkHttpClient = FloconTrustAll.apply(OkHttpClient.Builder())
    .connectTimeout(timeoutMs, TimeUnit.MILLISECONDS)
    .readTimeout(0, TimeUnit.MILLISECONDS)
    .pingInterval(20, TimeUnit.SECONDS)
    .build()

  @Volatile private var socket: WebSocket? = null
  private val opened = AtomicBoolean(false)
  private val ended = AtomicBoolean(false)

  fun open(onOpen: () -> Unit, onFailure: (Throwable) -> Unit) {
    val request = Request.Builder().url(url).header("User-Agent", "Flocon").build()
    socket = client.newWebSocket(request, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        opened.set(true)
        onOpen()
      }

      override fun onMessage(webSocket: WebSocket, text: String) = onMessage(text)

      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
        webSocket.close(1000, null)
        end()
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = end()

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        if (opened.get()) end() else {
          ended.set(true)
          shutdown()
          onFailure(t)
        }
      }
    })
  }

  fun send(text: String): Boolean = socket?.send(text) ?: false

  /** Closes the connection without calling `onClosed`. */
  fun close() {
    ended.set(true)
    socket?.close(1000, null)
    socket = null
    shutdown()
  }

  private fun end() {
    if (ended.getAndSet(true)) return
    socket = null
    shutdown()
    onClosed()
  }

  private fun shutdown() {
    client.dispatcher.executorService.shutdown()
    client.connectionPool.evictAll()
  }
}
