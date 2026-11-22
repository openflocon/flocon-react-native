#if DEBUG
import Foundation

/// A `wss://` connection to the desktop app. The desktop serves a self-signed certificate: the connection is encrypted,
/// but the certificate is not verified (so the app needs no App Transport Security exception). Debug builds only.
final class FloconWebSocketClient: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
  private let url: URL
  private let timeout: TimeInterval
  private let onMessage: (String) -> Void
  private let onClosed: () -> Void
  private let lock = NSLock()
  private var session: URLSession?
  private var task: URLSessionWebSocketTask?
  private var openCompletion: ((Error?) -> Void)?
  private var opened = false
  private var ended = false

  init(url: URL, timeout: TimeInterval, onMessage: @escaping (String) -> Void, onClosed: @escaping () -> Void) {
    self.url = url
    self.timeout = timeout
    self.onMessage = onMessage
    self.onClosed = onClosed
  }

  func open(completion: @escaping (Error?) -> Void) {
    let session = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: nil)
    var request = URLRequest(url: url, timeoutInterval: timeout)
    request.setValue("Flocon", forHTTPHeaderField: "User-Agent")
    let task = session.webSocketTask(with: request)
    lock.lock()
    self.session = session
    self.task = task
    openCompletion = completion
    lock.unlock()
    task.resume()
    DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { [weak self] in
      self?.failOpen(URLError(.timedOut))
    }
  }

  func send(_ text: String) -> Bool {
    lock.lock()
    let task = opened && !ended ? self.task : nil
    lock.unlock()
    guard let task else { return false }
    task.send(.string(text)) { [weak self] error in
      if error != nil { self?.end() }
    }
    return true
  }

  /// Closes the connection without calling `onClosed`.
  func close() {
    lock.lock()
    ended = true
    let task = self.task
    let session = self.session
    let completion = openCompletion
    openCompletion = nil
    lock.unlock()
    task?.cancel(with: .normalClosure, reason: nil)
    session?.invalidateAndCancel()
    completion?(URLError(.cancelled))
  }

  private func receive() {
    task?.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .success(.string(let text)):
        self.onMessage(text)
        self.receive()
      case .success(.data(let data)):
        if let text = String(data: data, encoding: .utf8) { self.onMessage(text) }
        self.receive()
      case .success:
        self.receive()
      case .failure:
        self.end()
      }
    }
  }

  private func failOpen(_ error: Error) {
    lock.lock()
    guard let completion = openCompletion, !opened else {
      lock.unlock()
      return
    }
    openCompletion = nil
    ended = true
    let session = self.session
    lock.unlock()
    session?.invalidateAndCancel()
    completion(error)
  }

  private func end() {
    lock.lock()
    if ended || !opened {
      lock.unlock()
      return
    }
    ended = true
    let session = self.session
    lock.unlock()
    session?.invalidateAndCancel()
    onClosed()
  }

  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    lock.lock()
    let completion = openCompletion
    openCompletion = nil
    opened = completion != nil
    lock.unlock()
    guard let completion else { return }
    completion(nil)
    receive()
  }

  func urlSession(
    _ session: URLSession,
    webSocketTask: URLSessionWebSocketTask,
    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
    reason: Data?
  ) {
    end()
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    failOpen(error ?? URLError(.networkConnectionLost))
    end()
  }

  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    FloconTrustAll.handle(challenge, completionHandler)
  }
}

/// Accepts the self-signed certificate of the Flocon desktop. Debug builds only.
enum FloconTrustAll {
  static func handle(
    _ challenge: URLAuthenticationChallenge,
    _ completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
       let trust = challenge.protectionSpace.serverTrust {
      completionHandler(.useCredential, URLCredential(trust: trust))
    } else {
      completionHandler(.performDefaultHandling, nil)
    }
  }
}

final class FloconTrustAllDelegate: NSObject, URLSessionDelegate {
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {
    FloconTrustAll.handle(challenge, completionHandler)
  }
}
#endif
