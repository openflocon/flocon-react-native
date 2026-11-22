import { FloconLogger } from '../../core/logger';
import { currentClient } from '../../core/registry';
import { uuidV4 } from '../../core/uuid';
import type { FloconHttpRequest } from './networkOptions';
import { headersWithContentType, type FloconNetworkOverride } from './networkOverrides';
import { FloconNetworkPlugin } from './networkPlugin';
import { utf8Length } from './webSocketEvent';

/**
 * The internals of React Native's `XMLHttpRequest` (`react-native/Libraries/Network/XMLHttpRequest.js`) used here.
 * `fetch` (whatwg-fetch) and axios both go through it, so patching its prototype captures every JS call.
 */
interface RNXMLHttpRequest {
  _method?: string;
  _url?: string;
  _headers: Record<string, string>;
  _requestId: number | null;
  _response: unknown;
  _sent: boolean;
  _aborted: boolean;
  _hasError: boolean;
  _timedOut: boolean;
  responseType: string;
  status: number;
  responseHeaders?: Record<string, string> | null;
  readonly response: unknown;
  addEventListener(type: string, listener: () => void): void;
  send(data?: unknown): void;
  __didReceiveResponse(id: number, status: number, headers: Record<string, string>, url: string): void;
  __didReceiveData(id: number, response: unknown): void;
  __didCompleteResponse(id: number, error: string, timeOutError: boolean): void;
}

type XHRClass = { prototype: RNXMLHttpRequest };

let installed: { proto: RNXMLHttpRequest; send: RNXMLHttpRequest['send'] } | null = null;
let fakeRequestIds = 0;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Captures the calls of `XMLHttpRequest` (and so of `fetch` and axios), and applies the mocks and bad network. */
export function installXhrInterceptor(xhr: XHRClass | undefined = (globalThis as any).XMLHttpRequest): void {
  if (installed || !xhr?.prototype) return;
  const proto = xhr.prototype;
  const originalSend = proto.send;
  installed = { proto, send: originalSend };
  proto.send = function send(this: RNXMLHttpRequest, data?: unknown) {
    const plugin = currentClient()?.plugin(FloconNetworkPlugin);
    const request: FloconHttpRequest = { url: this._url ?? '', method: this._method ?? 'GET', headers: { ...this._headers } };
    let shouldLog = false;
    try {
      shouldLog = !!plugin && plugin.shouldLog(request);
    } catch (e) {
      FloconLogger.logError('shouldLog failed', e);
    }
    if (!plugin || !shouldLog) {
      originalSend.call(this, data);
      return;
    }
    void intercept(this, plugin, request, data, originalSend);
  };
}

/** Puts back the original `XMLHttpRequest.prototype.send`. */
export function uninstallXhrInterceptor(): void {
  if (!installed) return;
  installed.proto.send = installed.send;
  installed = null;
}

async function intercept(
  xhr: RNXMLHttpRequest,
  plugin: FloconNetworkPlugin,
  request: FloconHttpRequest,
  data: unknown,
  originalSend: RNXMLHttpRequest['send'],
): Promise<void> {
  const callId = uuidV4();
  const start = now();
  const elapsed = () => now() - start;
  let override: FloconNetworkOverride | null = null;
  let isMocked = false;
  try {
    await plugin.ready; // the mocks of the previous launch
    const mock = plugin.findMock(request.url, request.method);
    isMocked = mock !== null;
    plugin.logRequest({
      callId,
      url: request.url,
      method: request.method,
      startTime: Date.now(),
      requestHeaders: request.headers,
      requestBody: describeBody(data),
      requestSize: typeof data === 'string' ? utf8Length(data) : null,
      isMocked,
    });
    // a mock or a bad network simulation answers instead of the network
    override = await plugin.applyOverride(mock);
  } catch (e) {
    FloconLogger.logError('Network interception failed', e);
  }
  if (xhr._aborted) return;

  if (override?.type === 'error') {
    safe(() =>
      plugin.logResponse({ callId, durationMs: elapsed(), error: override.className, isMocked: override.isMocked }),
    );
    fail(xhr, override.className, override.kind === 'timeout');
    return;
  }
  if (override?.type === 'response') {
    const headers = headersWithContentType(override);
    safe(() =>
      plugin.logResponse({
        callId,
        durationMs: elapsed(),
        httpCode: override.statusCode,
        contentType: headers['content-type'] ?? null,
        body: override.body,
        headers,
        size: utf8Length(override.body),
        requestHeaders: request.headers,
        isMocked: override.isMocked,
      }),
    );
    respond(xhr, override.statusCode, headers, override.body);
    return;
  }

  xhr.addEventListener('loadend', () => {
    void logRealResponse(xhr, plugin, request, callId, elapsed());
  });
  try {
    originalSend.call(xhr, data);
  } catch (e) {
    safe(() => plugin.logResponse({ callId, durationMs: elapsed(), error: String(e) }));
    throw e;
  }
}

async function logRealResponse(
  xhr: RNXMLHttpRequest,
  plugin: FloconNetworkPlugin,
  request: FloconHttpRequest,
  callId: string,
  durationMs: number,
): Promise<void> {
  try {
    if (xhr._aborted) {
      plugin.logResponse({ callId, durationMs, error: 'Canceled' });
      return;
    }
    if (xhr._hasError) {
      const error = typeof xhr._response === 'string' && xhr._response ? xhr._response : 'Network request failed';
      plugin.logResponse({ callId, durationMs, error: xhr._timedOut ? `Timeout: ${error}` : error });
      return;
    }
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(xhr.responseHeaders ?? {})) headers[k.toLowerCase()] = `${v}`;
    const image = plugin.isImage(request, { statusCode: xhr.status, headers });
    const { body, size } = image ? { body: null, size: await responseSize(xhr) } : await responseBody(xhr);
    plugin.logResponse({
      callId,
      durationMs,
      httpCode: xhr.status,
      contentType: headers['content-type'] ?? null,
      body,
      headers,
      size,
      requestHeaders: request.headers,
      isImage: image,
    });
  } catch (e) {
    FloconLogger.logError('Cannot log the response', e);
  }
}

async function responseBody(xhr: RNXMLHttpRequest): Promise<{ body: string | null; size: number | null }> {
  switch (xhr.responseType) {
    case '':
    case 'text':
    case 'json': {
      const text = typeof xhr._response === 'string' ? xhr._response : '';
      return { body: text, size: utf8Length(text) };
    }
    case 'blob': {
      const blob = xhr.response as Blob | null;
      if (!blob) return { body: null, size: null };
      return { body: await readBlobAsText(blob), size: blob.size };
    }
    default:
      return { body: null, size: await responseSize(xhr) };
  }
}

async function responseSize(xhr: RNXMLHttpRequest): Promise<number | null> {
  if (xhr.responseType === 'blob') return (xhr.response as Blob | null)?.size ?? null;
  return typeof xhr._response === 'string' ? utf8Length(xhr._response) : null;
}

function readBlobAsText(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsText(blob);
    } catch {
      resolve(null);
    }
  });
}

/** Answers the request with a fake response, through the same internal events as a real one. */
function respond(xhr: RNXMLHttpRequest, status: number, headers: Record<string, string>, body: string): void {
  const id = -++fakeRequestIds; // negative: never the id of a native request
  xhr._sent = true;
  xhr._requestId = id;
  xhr.__didReceiveResponse(id, status, headers, xhr._url ?? '');
  xhr.__didReceiveData(id, payload(xhr.responseType, body, headers['content-type']));
  xhr.__didCompleteResponse(id, '', false);
}

function fail(xhr: RNXMLHttpRequest, error: string, timeout: boolean): void {
  const id = -++fakeRequestIds;
  xhr._sent = true;
  xhr._requestId = id;
  xhr.__didCompleteResponse(id, error, timeout);
}

/** The body as the native module would have given it for the response type. */
function payload(responseType: string, body: string, contentType?: string): unknown {
  if (responseType === 'blob') {
    // the response getter builds the Blob from its native description
    return (new Blob([body], { type: contentType ?? '' }) as Blob & { data?: unknown }).data ?? body;
  }
  if (responseType === 'arraybuffer') return utf8ToBase64(body);
  return body;
}

function utf8ToBase64(text: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      code = 0x10000 + ((code - 0xd800) << 10) + (text.charCodeAt(++i) - 0xdc00);
    }
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += chars[(triple >> 18) & 63] + chars[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }
  return out;
}

function describeBody(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === 'string') return data.length === 0 ? null : data;
  const parts = (data as { getParts?: () => { fieldName: string; string?: string; name?: string; uri?: string }[] })
    .getParts;
  if (typeof parts === 'function') {
    // FormData: fields, and files by name
    return parts
      .call(data)
      .map((p) => (p.string !== undefined ? `${p.fieldName}=${p.string}` : `${p.fieldName}=<file ${p.name ?? p.uri ?? ''}>`))
      .join('&');
  }
  return null;
}

function safe(f: () => void): void {
  try {
    f();
  } catch {
    // logging must never break the app
  }
}

export const __testing = { utf8ToBase64, describeBody };
