import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

import type {
  FloconAppDirectories,
  FloconFileInfo,
  FloconSqlResult,
  FloconAppInfos,
  FloconPlatform, FloconSocket, FloconSocketHandlers, FloconUploadRequest } from './platform';

/** The `FloconNative` Expo module (`android/`, `ios/`): a full implementation in debug builds, a stub in release. */
interface FloconNativeModule {
  readonly isAvailable: boolean;
  openWebSocket(id: number, url: string, timeoutMs: number): Promise<void>;
  send(id: number, text: string): boolean;
  close(id: number): Promise<void>;
  upload(url: string, filePath: string, fileName: string, fields: Record<string, string>): Promise<void>;
  appInfos(): Promise<FloconAppInfos>;
  appIconBase64Png(): Promise<string | null>;
  readStorageFile(name: string): Promise<string | null>;
  writeStorageFile(name: string, content: string): Promise<void>;
  deleteStorageFile(name: string): Promise<void>;
  appDirectories(): Promise<FloconAppDirectories>;
  listDirectory(path: string): Promise<FloconFileInfo[]>;
  fileInfo(path: string): Promise<{ exists: boolean; isDirectory: boolean; isSymbolicLink: boolean }>;
  resolvePath(path: string): Promise<string>;
  directorySize(path: string): Promise<number>;
  deleteItem(path: string): Promise<void>;
  isSqlite(path: string): Promise<boolean>;
  sqliteExecute(path: string, query: string): Promise<FloconSqlResult>;
  addListener(event: 'onMessage', listener: (e: { id: number; text: string }) => void): EventSubscription;
  addListener(event: 'onClosed', listener: (e: { id: number }) => void): EventSubscription;
}

const OPEN_TIMEOUT_MS = 5000;

/** Binds the native module to the platform interface of the SDK. Exported for the tests. */
export function createNativePlatform(native: FloconNativeModule | null): FloconPlatform {
  if (!native?.isAvailable) return unavailablePlatform;
  const sockets = new Map<number, FloconSocketHandlers>();
  let nextId = 1;
  let subscribed = false;
  const subscribe = () => {
    if (subscribed) return;
    subscribed = true;
    native.addListener('onMessage', ({ id, text }) => sockets.get(id)?.onMessage(text));
    native.addListener('onClosed', ({ id }) => {
      const handlers = sockets.get(id);
      sockets.delete(id);
      handlers?.onClosed();
    });
  };
  return {
    isAvailable: true,
    async openWebSocket(url, handlers): Promise<FloconSocket> {
      subscribe();
      const id = nextId++;
      sockets.set(id, handlers);
      try {
        await native.openWebSocket(id, url, OPEN_TIMEOUT_MS);
      } catch (e) {
        sockets.delete(id);
        throw e;
      }
      return {
        send: (text) => sockets.has(id) && native.send(id, text),
        close: async () => {
          sockets.delete(id); // before closing, so that onClosed is not called
          await native.close(id);
        },
      };
    },
    upload: (r: FloconUploadRequest) => native.upload(r.url, r.filePath, r.fileName, { ...r.fields }),
    appInfos: () => native.appInfos(),
    appIconBase64Png: () => native.appIconBase64Png(),
    readStorageFile: (name) => native.readStorageFile(name),
    writeStorageFile: (name, content) => native.writeStorageFile(name, content),
    deleteStorageFile: (name) => native.deleteStorageFile(name),
    appDirectories: () => native.appDirectories(),
    listDirectory: (path) => native.listDirectory(path),
    fileInfo: (path) => native.fileInfo(path),
    resolvePath: (path) => native.resolvePath(path),
    directorySize: (path) => native.directorySize(path),
    deleteItem: (path) => native.deleteItem(path),
    isSqlite: (path) => native.isSqlite(path),
    sqliteExecute: (path, query) => native.sqliteExecute(path, query),
  };
}

const unavailable = () => Promise.reject(new Error('Flocon is not available in this build'));

const unavailablePlatform: FloconPlatform = {
  isAvailable: false,
  openWebSocket: unavailable,
  upload: unavailable,
  appInfos: unavailable,
  appIconBase64Png: unavailable,
  readStorageFile: unavailable,
  writeStorageFile: unavailable,
  deleteStorageFile: unavailable,
  appDirectories: unavailable,
  listDirectory: unavailable,
  fileInfo: unavailable,
  resolvePath: unavailable,
  directorySize: unavailable,
  deleteItem: unavailable,
  isSqlite: unavailable,
  sqliteExecute: unavailable,
};

export const nativePlatform: FloconPlatform = createNativePlatform(
  requireOptionalNativeModule<FloconNativeModule>('FloconNative'),
);
