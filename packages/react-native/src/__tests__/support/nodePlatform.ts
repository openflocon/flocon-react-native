import { lstatSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, existsSync } from 'fs';
import { basename, dirname, join, resolve as resolvePathNode } from 'path';
import WebSocket from 'ws';

import type { FloconAppInfos, FloconPlatform, FloconUploadRequest } from '../../platform/platform';

export const testAppInfos: FloconAppInfos = {
  deviceId: 'dev',
  deviceName: 'phone',
  platform: 'ios',
  appName: 'App',
  appPackageName: 'io.app',
};

export interface NodePlatform extends FloconPlatform {
  readonly files: Map<string, string>;
  readonly uploads: FloconUploadRequest[];
}

/** The platform of the SDK in Node: `ws` with the certificate check off, files in memory. */
export function nodePlatform(overrides: Partial<FloconPlatform> = {}): NodePlatform {
  const files = new Map<string, string>();
  const uploads: FloconUploadRequest[] = [];
  return {
    isAvailable: true,
    files,
    uploads,
    openWebSocket(url, handlers) {
      return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { rejectUnauthorized: false, headers: { 'User-Agent': 'Flocon' } });
        let closedByApp = false;
        let opened = false;
        const timeout = setTimeout(() => {
          socket.terminate();
          reject(new Error('timeout'));
        }, 5000);
        socket.on('open', () => {
          clearTimeout(timeout);
          opened = true;
          resolve({
            send: (text) => {
              if (socket.readyState !== WebSocket.OPEN) return false;
              socket.send(text);
              return true;
            },
            close: async () => {
              closedByApp = true;
              socket.terminate();
            },
          });
        });
        socket.on('message', (data) => handlers.onMessage(data.toString()));
        socket.on('error', (e) => {
          clearTimeout(timeout);
          reject(e);
        });
        socket.on('close', () => {
          if (opened && !closedByApp) handlers.onClosed();
        });
      });
    },
    upload: async (r) => {
      uploads.push(r);
    },
    appInfos: async () => testAppInfos,
    appIconBase64Png: async () => 'ICON',
    readStorageFile: async (name) => files.get(name) ?? null,
    writeStorageFile: async (name, content) => {
      files.set(name, content);
    },
    deleteStorageFile: async (name) => {
      files.delete(name);
    },
    appDirectories: async () => {
      throw new Error('appDirectories: give it in the test');
    },
    listDirectory: async (path) => {
      try {
        return readdirSync(path).map((name) => {
          const child = join(path, name);
          const stat = lstatSync(child);
          return {
            name,
            path: child,
            isDirectory: stat.isDirectory(),
            size: stat.isDirectory() ? 0 : stat.size,
            lastModified: Math.trunc(stat.mtimeMs),
          };
        });
      } catch {
        return [];
      }
    },
    fileInfo: async (path) => {
      try {
        const stat = lstatSync(path);
        return { exists: true, isDirectory: stat.isDirectory(), isSymbolicLink: stat.isSymbolicLink() };
      } catch {
        return { exists: false, isDirectory: false, isSymbolicLink: false };
      }
    },
    resolvePath: async (path) => resolveNode(path),
    directorySize: async (path) => sizeOf(path),
    deleteItem: async (path) => {
      if (existsSync(path) || isLink(path)) rmSync(path, { recursive: true, force: true });
    },
    isSqlite: async (path) => {
      try {
        return readFileSync(path).subarray(0, 16).toString('latin1') === 'SQLite format 3\u0000';
      } catch {
        return false;
      }
    },
    sqliteExecute: async () => ({ type: 'Error', message: 'no SQLite in the tests' }),
    ...overrides,
  };
}

/** A message sender that records what it is given. */
export function recordingSender() {
  const messages: { plugin: string; method: string; body: string }[] = [];
  return {
    messages,
    send: (m: { plugin: string; method: string; body: string }) => {
      messages.push(m);
    },
    bodies: () => messages.map((m) => JSON.parse(m.body)),
  };
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function resolveNode(path: string): string {
  const normalized = resolvePathNode(path);
  try {
    return realpathSync(normalized);
  } catch {
    const parent = dirname(normalized);
    return parent === normalized ? normalized : join(resolveNode(parent), basename(normalized));
  }
}

function sizeOf(path: string): number {
  let total = 0;
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    const stat = lstatSync(child);
    if (stat.isDirectory()) total += sizeOf(child);
    else if (stat.isFile()) total += statSync(child).size;
  }
  return total;
}
