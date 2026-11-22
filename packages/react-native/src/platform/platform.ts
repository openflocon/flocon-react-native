/** Identity of the app and device, sent with every message. */
export interface FloconAppInfos {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: string;
  readonly appName: string;
  readonly appPackageName: string;
}

/** An open `wss://` connection to a desktop. */
export interface FloconSocket {
  /** Returns false if the message could not be sent. */
  send(text: string): boolean;
  close(): Promise<void>;
}

export interface FloconSocketHandlers {
  onMessage(text: string): void;
  /** The connection was closed by the desktop or lost. Not called after `close()`. */
  onClosed(): void;
}

export interface FloconUploadRequest {
  readonly url: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly fields: Readonly<Record<string, string>>;
}

/** A file or folder, as listed by the platform. */
export interface FloconFileInfo {
  readonly name: string;
  /** Absolute path. */
  readonly path: string;
  readonly isDirectory: boolean;
  /** In bytes, 0 for a folder. */
  readonly size: number;
  /** In milliseconds since 1970. */
  readonly lastModified: number;
}

/** The folders of the app. */
export interface FloconAppDirectories {
  readonly documents: string;
  readonly support: string;
  readonly caches: string;
  readonly tmp: string;
  /** The data folder of the app, containing the others. */
  readonly container: string;
  /** Where the SQLite libraries keep their files by default. */
  readonly databases: string;
}

/** The result of a SQL query, in the format of the desktop. */
export type FloconSqlResult =
  | { readonly type: 'Select'; readonly columns: string[]; readonly values: (string | null)[][] }
  | { readonly type: 'Insert'; readonly insertedId: number }
  | { readonly type: 'UpdateDelete'; readonly affectedCount: number }
  | { readonly type: 'RawSuccess' }
  | { readonly type: 'Error'; readonly message: string };

/**
 * What the SDK needs from the device. In the app it is the `FloconNative` module; in the tests a Node implementation.
 */
export interface FloconPlatform {
  /** False in release builds, in Expo Go, or when the app was not rebuilt after installing Flocon. */
  readonly isAvailable: boolean;
  /**
   * Opens a `wss://` connection, accepting the self-signed certificate of the desktop.
   * Rejects when the desktop is unreachable, or after 5 seconds.
   */
  openWebSocket(url: string, handlers: FloconSocketHandlers): Promise<FloconSocket>;
  /** Sends a file to the desktop HTTP server, as `multipart/form-data` (fields, then `file`). */
  upload(request: FloconUploadRequest): Promise<void>;
  appInfos(): Promise<FloconAppInfos>;
  /** The app icon as a base64 PNG, or null. */
  appIconBase64Png(): Promise<string | null>;
  /** Files of the SDK that must survive a restart (last address, network mocks...). */
  readStorageFile(name: string): Promise<string | null>;
  writeStorageFile(name: string, content: string): Promise<void>;
  deleteStorageFile(name: string): Promise<void>;

  // Files and databases of the app, for the Files and Database plugins.
  appDirectories(): Promise<FloconAppDirectories>;
  /** The content of a folder, empty if it cannot be read. Symbolic links are not followed. */
  listDirectory(path: string): Promise<FloconFileInfo[]>;
  fileInfo(path: string): Promise<{ exists: boolean; isDirectory: boolean; isSymbolicLink: boolean }>;
  /** Resolves `..` and the symbolic links, also when the path does not exist (its deepest existing parent is). */
  resolvePath(path: string): Promise<string>;
  /** The size of the content of a folder, in bytes. */
  directorySize(path: string): Promise<number>;
  /** Deletes a file, a folder and its content, or a symbolic link (not what it points to). */
  deleteItem(path: string): Promise<void>;
  /** Whether the file starts with the SQLite header. */
  isSqlite(path: string): Promise<boolean>;
  /** Runs a query on its own connection to the SQLite file. */
  sqliteExecute(path: string, query: string): Promise<FloconSqlResult>;
}
