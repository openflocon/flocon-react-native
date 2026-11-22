import { FloconLogger } from '../../core/logger';
import { currentClient } from '../../core/registry';
import { uuidV4 } from '../../core/uuid';
import type { FloconHttpRequest } from './networkOptions';
import { headersWithContentType, type FloconNetworkOverride } from './networkOverrides';
import { FloconNetworkPlugin } from './networkPlugin';
import { utf8Length } from './webSocketEvent';

type Fetch = typeof fetch & { polyfill?: boolean };

let installed: { target: { fetch: Fetch }; original: Fetch } | null = null;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Captures the calls of the global `fetch`, and applies the mocks and bad network. Expo replaces the `fetch` of React
 * Native (built on `XMLHttpRequest`, so captured by the XHR interceptor) by a native one: only that one is wrapped,
 * so that no call is logged twice.
 */
export function installFetchInterceptor(target: { fetch: Fetch } = globalThis as unknown as { fetch: Fetch }): void {
  const original = target.fetch;
  if (installed || typeof original !== 'function' || original.polyfill) return;
  installed = { target, original };
  const wrapped: Fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const plugin = currentClient()?.plugin(FloconNetworkPlugin);
    const request = describeRequest(input, init);
    let shouldLog = false;
    try {
      shouldLog = !!plugin && plugin.shouldLog(request);
    } catch (e) {
      FloconLogger.logError('shouldLog failed', e);
    }
    if (!plugin || !shouldLog) return original(input, init);
    return intercept(plugin, original, request, input, init);
  };
  target.fetch = wrapped;
}

/** Puts back the original `fetch`. */
export function uninstallFetchInterceptor(): void {
  if (!installed) return;
  installed.target.fetch = installed.original;
  installed = null;
}

async function intercept(
  plugin: FloconNetworkPlugin,
  original: Fetch,
  request: FloconHttpRequest,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<Response> {
  const callId = uuidV4();
  const start = now();
  const elapsed = () => now() - start;
  const body = typeof init?.body === 'string' ? init.body : null;
  let override: FloconNetworkOverride | null = null;
  try {
    await plugin.ready; // the mocks of the previous launch
    const mock = plugin.findMock(request.url, request.method);
    plugin.logRequest({
      callId,
      url: request.url,
      method: request.method,
      startTime: Date.now(),
      requestHeaders: request.headers,
      requestBody: body || null,
      requestSize: body ? utf8Length(body) : null,
      isMocked: mock !== null,
    });
    // a mock or a bad network simulation answers instead of the network
    override = await plugin.applyOverride(mock);
  } catch (e) {
    FloconLogger.logError('Network interception failed', e);
  }

  if (override?.type === 'error') {
    safe(() => plugin.logResponse({ callId, durationMs: elapsed(), error: override.className, isMocked: override.isMocked }));
    // the error of fetch for a network failure
    throw new TypeError(override.kind === 'timeout' ? `Network request timed out (${override.className})` : override.className);
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
    return new Response(override.body, { status: override.statusCode, headers });
  }

  let response: Response;
  try {
    response = await original(input, init);
  } catch (e) {
    safe(() => plugin.logResponse({ callId, durationMs: elapsed(), error: e instanceof Error ? e.message : String(e) }));
    throw e;
  }
  void logResponse(plugin, request, callId, elapsed(), response);
  return response;
}

async function logResponse(
  plugin: FloconNetworkPlugin,
  request: FloconHttpRequest,
  callId: string,
  durationMs: number,
  response: Response,
): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    const image = plugin.isImage(request, { statusCode: response.status, headers });
    // a clone, so that the app reads the body as usual
    const body = image ? null : await response.clone().text();
    const length = Number(headers['content-length']);
    plugin.logResponse({
      callId,
      durationMs,
      httpCode: response.status,
      contentType: headers['content-type'] ?? null,
      body,
      headers,
      size: body != null ? utf8Length(body) : Number.isFinite(length) ? length : null,
      requestHeaders: request.headers,
      isImage: image,
    });
  } catch (e) {
    FloconLogger.logError('Cannot log the response', e);
  }
}

export function describeRequest(input: RequestInfo | URL, init?: RequestInit): FloconHttpRequest {
  const fromRequest = typeof input === 'object' && 'url' in input ? (input as Request) : null;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (fromRequest?.url ?? String(input));
  const method = (init?.method ?? fromRequest?.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  const add = (source: HeadersInit | undefined) => {
    if (!source) return;
    if (typeof (source as Headers).forEach === 'function' && !Array.isArray(source)) {
      (source as Headers).forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
    } else if (Array.isArray(source)) {
      for (const [key, value] of source) headers[key.toLowerCase()] = value;
    } else {
      for (const [key, value] of Object.entries(source)) headers[key.toLowerCase()] = String(value);
    }
  };
  add(fromRequest?.headers);
  add(init?.headers);
  return { url, method, headers };
}

function safe(f: () => void): void {
  try {
    f();
  } catch {
    // logging must never break the app
  }
}
