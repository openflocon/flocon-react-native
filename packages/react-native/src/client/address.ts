/** The address given to `Flocon.connect` cannot be read. */
export class FloconAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FloconAddressError';
  }
}

/** A desktop app to connect to: its host and the two ports of its servers. */
export interface FloconAddress {
  readonly host: string;
  readonly webSocketPort: number;
  readonly httpPort: number;
}

export interface FloconPorts {
  readonly webSocketPort: number;
  readonly httpPort: number;
}

export const webSocketUrl = (a: FloconAddress): string => `wss://${a.host}:${a.webSocketPort}`;

export const uploadUrl = (a: FloconAddress): string => `https://${a.host}:${a.httpPort}/upload`;

export const sameAddress = (a: FloconAddress, b: FloconAddress): boolean =>
  a.host === b.host && a.webSocketPort === b.webSocketPort && a.httpPort === b.httpPort;

export const describeAddress = (a: FloconAddress): string => `${a.host}:${a.webSocketPort}:${a.httpPort}`;

/**
 * Reads `address`: an IP address or a host, with optional ports, such as `192.168.1.20`, `my-mac.local`,
 * `192.168.1.20:10023` (WebSocket port) or `192.168.1.20:10023:10024` (WebSocket port, then HTTP port).
 * An omitted port takes the given default. No scheme, path, query, fragment, whitespace nor IPv6.
 *
 * @throws FloconAddressError if the address cannot be read.
 */
export function parseAddress(address: string, defaults: FloconPorts): FloconAddress {
  const trimmed = address.trim();
  const invalid = new FloconAddressError(
    `Cannot read '${address}', enter the IP address of the computer, such as 192.168.1.20, ` +
      'with optional ports, such as 192.168.1.20:10023:10024 (WebSocket port, then HTTP port), ' +
      'without scheme nor path',
  );
  const parts = trimmed.split(':');
  if (trimmed.length === 0 || /[/?#\s]/.test(trimmed) || parts.length > 3 || parts[0].length === 0) {
    throw invalid;
  }
  const port = (text: string): number => {
    const value = Number(text);
    if (text.length === 0 || text.length > 5 || !/^[0-9]+$/.test(text) || value < 1 || value > 65535) {
      throw new FloconAddressError(
        `Cannot read the ports of '${address}', each must be an integer from 1 to 65535, with at most 5 digits`,
      );
    }
    return value;
  };
  return {
    host: parts[0],
    webSocketPort: parts.length >= 2 ? port(parts[1]) : defaults.webSocketPort,
    httpPort: parts.length === 3 ? port(parts[2]) : defaults.httpPort,
  };
}

/** The address kept for the next launch: the host alone with the default ports, else `host:webSocketPort:httpPort`. */
export function storedAddress(a: FloconAddress, defaults: FloconPorts): string {
  return a.webSocketPort === defaults.webSocketPort && a.httpPort === defaults.httpPort
    ? a.host
    : describeAddress(a);
}
