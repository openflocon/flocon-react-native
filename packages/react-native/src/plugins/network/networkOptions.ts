/** An HTTP request, as the network options see it. */
export interface FloconHttpRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** An HTTP response, as the network options see it. Header names in lower case. */
export interface FloconHttpResponse {
  readonly statusCode?: number;
  readonly headers: Readonly<Record<string, string>>;
}

export interface FloconNetworkOptions {
  /** Returns whether a call is sent to the desktop app. All calls by default. */
  readonly shouldLog?: (request: FloconHttpRequest) => boolean;
  /**
   * Returns whether a response is an image, in addition to the `Content-Type: image/*` check.
   * The body of an image is not sent: the desktop downloads it from its URL.
   */
  readonly isImage?: (request: FloconHttpRequest, response: FloconHttpResponse) => boolean;
}
