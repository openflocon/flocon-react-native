import { defaultConfig, DEFAULT_HTTP_PORT, DEFAULT_WEB_SOCKET_PORT, type FloconConfig } from './config';
import type { FloconPluginFactory } from './core/factory';
import { FloconLogger } from './core/logger';
import { initializeFlocon } from './flocon';
import type { FloconPlatform } from './platform/platform';

/** What `startFlocon` starts: the address of the desktop app and the plugins to install. */
export class FloconSetup {
  /** @internal */ config: FloconConfig = defaultConfig;
  /** @internal */ readonly factories: FloconPluginFactory[] = [];

  /**
   * The desktop app to connect to. `localhost` and the default ports when not called.
   *
   * `host` is the desktop host (`10.0.2.2` from the Android emulator, the IP of the computer from a physical device).
   * Use the same ports as the desktop app if you changed them in its settings.
   */
  connect(
    o: {
      host?: string;
      webSocketPort?: number;
      httpPort?: number;
      rememberLastAddress?: boolean;
      /** Another address tried at start, such as `192.168.1.20`. */
      additionalAddress?: string;
      /** How many messages are kept while no desktop is reachable. 5000 by default. */
      bufferCapacity?: number;
    } = {},
  ): this {
    this.config = {
      host: o.host ?? 'localhost',
      webSocketPort: o.webSocketPort ?? DEFAULT_WEB_SOCKET_PORT,
      httpPort: o.httpPort ?? DEFAULT_HTTP_PORT,
      rememberLastAddress: o.rememberLastAddress ?? true,
      additionalAddress: o.additionalAddress,
      bufferCapacity: o.bufferCapacity ?? defaultConfig.bufferCapacity,
    };
    return this;
  }

  /** Installs a plugin, in the order of the calls. Installing the same class twice keeps the last one. */
  install(factory: FloconPluginFactory): this {
    const index = this.factories.findIndex((f) => f.constructor === factory.constructor);
    if (index >= 0) this.factories.splice(index, 1);
    this.factories.push(factory);
    return this;
  }
}

let started = false;

/**
 * Starts Flocon with the address of the desktop app and the plugins to install, in debug builds only:
 *
 * ```ts
 * if (__DEV__) {
 *   await startFlocon((flocon) => flocon
 *     .connect({ host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost' })
 *     .install(new FloconNetwork())
 *     .install(new FloconFiles()));
 * }
 * ```
 *
 * The plugins of this package (network, analytics, tables, timeline, feature flags, deeplinks, dashboard) are always
 * available: install them only to give them options (the network capture starts with `install(new FloconNetwork())`).
 *
 * Does nothing when called again, in release builds (the native code of Flocon is not in them), and in Expo Go.
 * Never rejects.
 *
 * @param platform for the tests: the native module by default.
 */
export async function startFlocon(
  setup?: (flocon: FloconSetup) => FloconSetup | void,
  platform?: FloconPlatform,
  /** @internal */ retryDelayMs?: number,
): Promise<void> {
  if (started) return;
  const flocon = new FloconSetup();
  try {
    setup?.(flocon);
  } catch (e) {
    FloconLogger.logError('The setup of startFlocon failed', e);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const resolved: FloconPlatform = platform ?? require('./platform/nativePlatform').nativePlatform;
  if (!resolved.isAvailable) {
    FloconLogger.log('Flocon is not available (release build, Expo Go, or app not rebuilt): not started');
    return;
  }
  started = true;
  initializeFlocon(flocon.config, resolved, retryDelayMs);
  for (const factory of flocon.factories) {
    try {
      await factory.install();
    } catch (e) {
      FloconLogger.logError(`Cannot install ${factory.constructor.name}`, e);
    }
  }
}

/** @internal */
export function resetStarted(): void {
  started = false;
}
