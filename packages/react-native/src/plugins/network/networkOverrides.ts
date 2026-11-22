/**
 * How an app-side error is reproduced, derived from the exception class name sent by the desktop
 * (Java names such as `java.net.SocketTimeoutException`).
 */
export type FloconErrorKind = 'timeout' | 'connection' | 'unknown';

export function errorKindOf(className: string): FloconErrorKind {
  const name = className.toLowerCase();
  if (name.includes('timeout')) return 'timeout';
  if (['socket', 'connect', 'unknownhost', 'ssl', 'eof'].some((k) => name.includes(k))) return 'connection';
  return 'unknown';
}

/** What the HTTP interceptor must answer instead of performing the real call. */
export type FloconNetworkOverride =
  /** A fake HTTP response. `isMocked`: true for a mock, false for a simulated bad connection. */
  | {
      readonly type: 'response';
      readonly statusCode: number;
      readonly body: string;
      readonly mediaType: string;
      readonly headers: Readonly<Record<string, string>>;
      readonly isMocked: boolean;
    }
  /** A fake network error. */
  | { readonly type: 'error'; readonly className: string; readonly kind: FloconErrorKind; readonly isMocked: boolean };

/** The headers of a fake response, with the content type when the mock defines one and the headers do not. */
export function headersWithContentType(o: Extract<FloconNetworkOverride, { type: 'response' }>): Record<string, string> {
  const hasContentType = Object.keys(o.headers).some((k) => k.toLowerCase() === 'content-type');
  return { ...o.headers, ...(!hasContentType && o.mediaType ? { 'content-type': o.mediaType } : {}) };
}

/** A mock configured from the desktop: answers the matching calls instead of the network. */
export interface FloconMock {
  /** A regular expression that must match the whole url. */
  readonly urlPattern: string;
  /** `GET`, `POST`... or `*`. */
  readonly method: string;
  readonly delayMs: number;
  readonly httpCode?: number;
  readonly body: string;
  readonly mediaType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly errorException?: string;
}

export function mockMatches(mock: FloconMock, url: string, method: string): boolean {
  if (mock.method !== '*' && mock.method.toLowerCase() !== method.toLowerCase()) return false;
  try {
    return new RegExp(`^(?:${mock.urlPattern})$`).test(url);
  } catch {
    return false; // invalid pattern
  }
}

export function mockOverride(mock: FloconMock): FloconNetworkOverride | null {
  if (mock.errorException != null) {
    return { type: 'error', className: mock.errorException, kind: errorKindOf(mock.errorException), isMocked: true };
  }
  if (mock.httpCode == null) return null;
  return {
    type: 'response',
    statusCode: mock.httpCode,
    body: mock.body,
    mediaType: mock.mediaType,
    headers: mock.headers,
    isMocked: true,
  };
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Parses the `setup_mocks` message. Unreadable input gives no mock. */
export function parseMocks(json: string): FloconMock[] {
  try {
    const mocks: FloconMock[] = [];
    for (const item of JSON.parse(json) as Record<string, any>[]) {
      const expectation = item.expectation;
      const response = item.response;
      if (typeof expectation?.urlPattern !== 'string' || typeof expectation.method !== 'string' || !response) {
        throw new Error('Invalid mock');
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers ?? {})) headers[k] = `${v}`;
      const mock: FloconMock = {
        urlPattern: expectation.urlPattern,
        method: expectation.method,
        delayMs: Math.trunc(num(response.delay) ?? 0),
        httpCode: num(response.httpCode) != null ? Math.trunc(response.httpCode) : undefined,
        body: str(response.body) ?? '',
        mediaType: str(response.mediaType) ?? '',
        headers,
        errorException: str(response.errorException),
      };
      if (mockOverride(mock) != null) mocks.push(mock);
    }
    return mocks;
  } catch {
    return [];
  }
}

export interface FloconBadQualityError {
  readonly weight: number;
  readonly errorCode: number;
  readonly errorBody: string;
  readonly errorContentType: string;
  /** When set, the call fails with this exception instead of returning an HTTP error. */
  readonly errorException?: string;
}

/** A bad network simulation: random latency and random errors. */
export interface FloconBadQualityConfig {
  readonly latencyTriggerProbability: number;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly errorProbability: number;
  readonly errors: readonly FloconBadQualityError[];
}

/** Parses the `setup_bad_network_config` message. Unreadable input gives no configuration. */
export function parseBadQualityConfig(json: string): FloconBadQualityConfig | null {
  try {
    const value = JSON.parse(json);
    const latency = value.latency;
    const required = [
      latency?.latencyTriggerProbability,
      latency?.minLatencyMs,
      latency?.maxLatencyMs,
      value.errorProbability,
    ];
    if (required.some((v) => typeof v !== 'number') || !Array.isArray(value.errors)) return null;
    return {
      latencyTriggerProbability: latency.latencyTriggerProbability,
      minLatencyMs: Math.trunc(latency.minLatencyMs),
      maxLatencyMs: Math.trunc(latency.maxLatencyMs),
      errorProbability: value.errorProbability,
      errors: value.errors.map((e: Record<string, unknown>) => {
        if (typeof e.weight !== 'number') throw new Error('Invalid error');
        const exception = str(e.errorException);
        return {
          weight: e.weight,
          errorCode: Math.trunc(num(e.errorCode) ?? 0),
          errorBody: str(e.errorBody) ?? '',
          errorContentType: str(e.errorContentType) ?? '',
          errorException: exception ? exception : undefined,
        };
      }),
    };
  } catch {
    return null;
  }
}

/** `random()` returns a number in [0, 1), as `Math.random`. */
export type FloconRandom = () => number;

export const shouldSimulateLatency = (c: FloconBadQualityConfig, random: FloconRandom): boolean =>
  c.latencyTriggerProbability > 0 && (c.latencyTriggerProbability >= 1 || random() < c.latencyTriggerProbability);

export function randomLatencyMs(c: FloconBadQualityConfig, random: FloconRandom): number {
  const max = c.maxLatencyMs < c.minLatencyMs ? c.minLatencyMs : c.maxLatencyMs;
  return c.minLatencyMs + Math.floor(random() * (max - c.minLatencyMs + 1));
}

export const shouldFail = (c: FloconBadQualityConfig, random: FloconRandom): boolean =>
  c.errorProbability > 0 && random() < c.errorProbability;

/** Picks an error, the more likely the bigger its weight. */
export function selectRandomError(c: FloconBadQualityConfig, random: FloconRandom): FloconBadQualityError | null {
  if (c.errors.length === 0) return null;
  const total = c.errors.reduce((sum, e) => sum + e.weight, 0);
  let pick = random() * total;
  for (const error of c.errors) {
    pick -= error.weight;
    if (pick <= 0) return error;
  }
  return c.errors[0];
}

export function badQualityErrorOverride(e: FloconBadQualityError): FloconNetworkOverride {
  return e.errorException != null
    ? { type: 'error', className: e.errorException, kind: errorKindOf(e.errorException), isMocked: false }
    : {
        type: 'response',
        statusCode: e.errorCode,
        body: e.errorBody,
        mediaType: e.errorContentType,
        headers: {},
        isMocked: false,
      };
}
