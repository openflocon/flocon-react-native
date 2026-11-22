import type { FloconPluginFactory } from '../../core/factory';
import { currentClient } from '../../core/registry';
import type { FloconNetworkOptions } from './networkOptions';
import { FloconNetworkPlugin } from './networkPlugin';
import type { FloconWebSocketEvent } from './webSocketEvent';
import { installFetchInterceptor } from './fetchInterceptor';
import { installXhrInterceptor } from './xhrInterceptor';

/**
 * Captures the network calls of the app (`fetch`, including the native `fetch` of Expo, axios and every library built
 * on `XMLHttpRequest`), and applies the mocks and the bad network set from the desktop.
 *
 * ```ts
 * startFlocon((flocon) => flocon.install(new FloconNetwork({
 *   shouldLog: (request) => !request.url.includes('analytics.example.com'),
 *   isImage: (request) => request.url.startsWith('https://images.example.com'),
 * })));
 * ```
 *
 * Images loaded by `<Image>` and native SDKs do not go through JavaScript and are not captured.
 */
export class FloconNetwork implements FloconPluginFactory {
  constructor(readonly options: FloconNetworkOptions = {}) {}

  async install(): Promise<void> {
    const plugin = currentClient()?.plugin(FloconNetworkPlugin);
    if (!plugin) return;
    plugin.options = this.options;
    installXhrInterceptor();
    installFetchInterceptor();
  }
}

/** `Flocon.network`: the helpers of the Network plugin that are not the interceptor. */
export const FloconNetworkApi = {
  /**
   * Sends a WebSocket event to the desktop app. WebSocket traffic is not intercepted: call this for each event of the
   * connections you want to inspect.
   */
  logWebSocketEvent(event: FloconWebSocketEvent): void {
    currentClient()?.plugin(FloconNetworkPlugin)?.logWebSocketEvent(event);
  },
};
