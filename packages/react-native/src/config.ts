import { FloconLogger } from './core/logger';

export const DEFAULT_WEB_SOCKET_PORT = 9023;
export const DEFAULT_HTTP_PORT = 9024;
export const DEFAULT_BUFFER_CAPACITY = 5000;

/**
 * Where the SDK finds the Flocon desktop app, and how it keeps what the app logs until it is reachable.
 *
 * `localhost` works from the iOS Simulator. From the Android emulator use `10.0.2.2`; on a physical device use the
 * local IP address of the computer running Flocon (or `Flocon.connect`, or the QR code of the desktop).
 * The ports must match the ones of the Flocon desktop settings (`9023` and `9024` by default).
 */
export interface FloconConfig {
  /** Host name or IP address of the computer running the Flocon desktop app. Always tried. */
  readonly host: string;
  /** Port of the desktop WebSocket server (`wss://`). */
  readonly webSocketPort: number;
  /** Port of the desktop HTTP server (`https://`, used by the file downloads). */
  readonly httpPort: number;
  /** How many messages are kept while no desktop is reachable: above it, the oldest are dropped. */
  readonly bufferCapacity: number;
  /** Another address tried at start next to `host` (the last address connected with `Flocon.connect` wins over it). */
  readonly additionalAddress?: string;
  /** Whether the last address connected with `Flocon.connect` is tried again at the next launch. */
  readonly rememberLastAddress: boolean;
}

export const defaultConfig: FloconConfig = {
  host: 'localhost',
  webSocketPort: DEFAULT_WEB_SOCKET_PORT,
  httpPort: DEFAULT_HTTP_PORT,
  bufferCapacity: DEFAULT_BUFFER_CAPACITY,
  rememberLastAddress: true,
};

/** The same configuration, with the ports outside 1...65535 and a non positive buffer replaced by the default ones. */
export function sanitizeConfig(config: FloconConfig): FloconConfig {
  const port = (value: number, fallback: number, name: string): number => {
    if (Number.isInteger(value) && value >= 1 && value <= 65535) return value;
    FloconLogger.log(`Invalid ${name} ${value}, using ${fallback}`);
    return fallback;
  };
  return {
    ...config,
    webSocketPort: port(config.webSocketPort, DEFAULT_WEB_SOCKET_PORT, 'WebSocket port'),
    httpPort: port(config.httpPort, DEFAULT_HTTP_PORT, 'HTTP port'),
    bufferCapacity: config.bufferCapacity < 1 ? DEFAULT_BUFFER_CAPACITY : config.bufferCapacity,
  };
}
