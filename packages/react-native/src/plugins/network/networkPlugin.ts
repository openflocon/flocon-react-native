import { FloconLogger } from '../../core/logger';
import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { uuidV4 } from '../../core/uuid';
import type { FloconMessageFromServer } from '../../model/messages';
import type { FloconHttpRequest, FloconHttpResponse, FloconNetworkOptions } from './networkOptions';
import {
  badQualityErrorOverride,
  mockMatches,
  mockOverride,
  parseBadQualityConfig,
  parseMocks,
  randomLatencyMs,
  selectRandomError,
  shouldFail,
  shouldSimulateLatency,
  type FloconBadQualityConfig,
  type FloconMock,
  type FloconNetworkOverride,
  type FloconRandom,
} from './networkOverrides';
import type { FloconNetworkStore } from './networkStore';
import { utf8Length, type FloconWebSocketEvent } from './webSocketEvent';

const WEB_SOCKET_EVENTS = {
  closed: 'closed',
  closing: 'closing',
  error: 'error',
  receiveMessage: 'received',
  sendMessage: 'sent',
  open: 'open',
} as const;

/** Sends the network calls and WebSocket events of the app to the Flocon desktop app. */
export class FloconNetworkPlugin implements FloconPlugin {
  static readonly pluginName = 'network';
  readonly pluginName = FloconNetworkPlugin.pluginName;

  /** The options installed with `startFlocon` (`install(new FloconNetwork(...))`). */
  options: FloconNetworkOptions = {};
  /** The mocks configured from the desktop. The first one matching a call wins. */
  mocks: FloconMock[] = [];
  /** The bad network simulation configured from the desktop, if any. */
  badQualityConfig: FloconBadQualityConfig | null = null;
  /** Resolves once the mocks and the bad network configuration saved by the previous launch are loaded. */
  readonly ready: Promise<void>;

  private readonly sender: FloconMessageSender;
  private readonly store?: FloconNetworkStore;
  private readonly random: FloconRandom;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(o: {
    sender: FloconMessageSender;
    store?: FloconNetworkStore;
    random?: FloconRandom;
    delay?: (ms: number) => Promise<void>;
  }) {
    this.sender = o.sender;
    this.store = o.store;
    this.random = o.random ?? Math.random;
    this.delay = o.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.ready = this.loadSaved().catch((e) => FloconLogger.logError('Cannot load the network configuration', e));
  }

  private async loadSaved(): Promise<void> {
    if (!this.store) return;
    // never overwrite what the desktop already sent while loading
    const mocks = await this.store.loadMocks();
    if (mocks != null && this.mocks.length === 0) this.mocks = parseMocks(mocks);
    const bad = await this.store.loadBadNetworkConfig();
    if (bad != null && this.badQualityConfig == null) this.badQualityConfig = parseBadQualityConfig(bad);
  }

  /** Whether `request` is sent to the desktop app, as decided by `shouldLog`. */
  shouldLog(request: FloconHttpRequest): boolean {
    return this.options.shouldLog?.(request) ?? true;
  }

  /** Whether `response` is an image: a `Content-Type: image/*` header, or the `isImage` option. */
  isImage(request: FloconHttpRequest, response: FloconHttpResponse): boolean {
    return (
      (response.headers['content-type']?.toLowerCase().startsWith('image/') ?? false) ||
      (this.options.isImage?.(request, response) ?? false)
    );
  }

  onConnectedToServer(): void {}

  onMessageReceived(message: FloconMessageFromServer): void {
    switch (message.method) {
      case 'setup_mocks':
        this.mocks = parseMocks(message.body);
        void this.store?.saveMocks(message.body);
        break;
      case 'setup_bad_network_config':
        this.badQualityConfig = parseBadQualityConfig(message.body);
        void this.store?.saveBadNetworkConfig(this.badQualityConfig == null ? null : message.body);
        break;
    }
  }

  /** The mock that answers this call, if any. Call it before `logRequest` to set `isMocked`. */
  findMock(url: string, method: string): FloconMock | null {
    return this.mocks.find((m) => mockMatches(m, url, method)) ?? null;
  }

  /**
   * Applies the mock or the bad network simulation: waits for the configured delay, then returns what the interceptor
   * must answer instead of the real call, or null to perform the real call.
   */
  async applyOverride(mock: FloconMock | null): Promise<FloconNetworkOverride | null> {
    if (mock) {
      if (mock.delayMs > 0) await this.delay(mock.delayMs);
      return mockOverride(mock);
    }
    const config = this.badQualityConfig;
    if (!config) return null;
    if (shouldSimulateLatency(config, this.random)) await this.delay(randomLatencyMs(config, this.random));
    if (shouldFail(config, this.random)) {
      const error = selectRandomError(config, this.random);
      return error ? badQualityErrorOverride(error) : null;
    }
    return null;
  }

  /** Optional values are sent as explicit `null`s, as the desktop expects. */
  logRequest(o: {
    callId: string;
    url: string;
    method: string;
    startTime: number;
    requestHeaders: Record<string, string>;
    requestBody?: string | null;
    requestSize?: number | null;
    isMocked?: boolean;
  }): void {
    this.sendValue('log_network_call_request', {
      floconCallId: o.callId,
      floconNetworkType: 'http',
      url: o.url,
      method: o.method,
      startTime: o.startTime,
      requestHeaders: o.requestHeaders,
      requestBody: o.requestBody ?? null,
      requestSize: o.requestSize ?? null,
      isMocked: o.isMocked ?? false,
    });
  }

  logResponse(o: {
    callId: string;
    durationMs: number;
    httpCode?: number | null;
    contentType?: string | null;
    body?: string | null;
    headers?: Record<string, string>;
    size?: number | null;
    error?: string | null;
    requestHeaders?: Record<string, string> | null;
    isImage?: boolean;
    isMocked?: boolean;
  }): void {
    this.sendValue('log_network_call_response', {
      floconCallId: o.callId,
      floconNetworkType: 'http',
      isMocked: o.isMocked ?? false,
      durationMs: o.durationMs,
      isImage: o.isImage ?? false,
      requestHeaders: o.requestHeaders ?? null,
      responseHttpCode: o.httpCode ?? null,
      responseContentType: o.contentType ?? null,
      responseBody: o.body ?? null,
      responseHeaders: o.headers ?? {},
      responseSize: o.size ?? null,
      responseGrpcStatus: null,
      responseError: o.error ?? null,
    });
  }

  logWebSocketEvent(event: FloconWebSocketEvent): void {
    this.sendValue('log_websocket_event', {
      id: uuidV4(),
      event: WEB_SOCKET_EVENTS[event.event],
      url: event.websocketUrl,
      size: event.size ?? (event.message == null ? 0 : utf8Length(event.message)),
      timestamp: (event.timestamp ?? new Date()).getTime(),
      message: event.message ?? null,
      error: event.error == null ? null : String(event.error instanceof Error ? event.error.message : event.error),
    });
  }

  private sendValue(method: string, value: object): void {
    try {
      this.sender.send({ plugin: this.pluginName, method, body: JSON.stringify(value) });
    } catch {
      // logging must never break the app
    }
  }
}
