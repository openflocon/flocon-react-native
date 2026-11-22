import {
  FloconLogger,
  FloconPaths,
  type FloconFileInfo,
  type FloconFileSender,
  type FloconMessageFromServer,
  type FloconMessageSender,
  type FloconPlatform,
  type FloconPlugin,
} from '@openflocon/react-native';

/** A folder the desktop can open, shown at the top of the Files section. */
export interface FloconFileRoot {
  /** Stable identifier, sent back by the desktop as a constant path. */
  readonly id: string;
  /** Name shown in the desktop app. */
  readonly name: string;
  readonly path: string;
}

interface Request {
  requestId: string;
  path: string;
  isConstantPath?: boolean;
  withFoldersSize?: boolean;
  filePath: string;
  filePaths: string[];
  parentPath: string;
  isConstantParentPath?: boolean;
}

/**
 * Lets the Flocon desktop app browse, download and delete the files of the app, limited to the root folders: any path
 * outside of every root is refused, symbolic links being resolved, and the root folders themselves are never deleted.
 */
export class FloconFilesPlugin implements FloconPlugin {
  static readonly pluginName = 'files';
  readonly pluginName = FloconFilesPlugin.pluginName;
  // in registration order, a folder registered again keeps its place
  private readonly registered: FloconFileRoot[] = [];
  private withFoldersSize = false;
  // File operations can be slow: they run in order.
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly sender: FloconMessageSender,
    private readonly fileSender: FloconFileSender,
    private readonly platform: FloconPlatform,
    private readonly defaultRoots: () => Promise<FloconFileRoot[]>,
  ) {}

  /** Shows a folder in the Files section of the desktop app, or renames a folder already shown. */
  async register(displayName: string, path: string): Promise<void> {
    const id = await this.platform.resolvePath(FloconPaths.normalize(path));
    const root = { id, name: displayName, path: FloconPaths.normalize(path) };
    const index = this.registered.findIndex((r) => r.id === id);
    if (index >= 0) this.registered[index] = root;
    else this.registered.push(root);
  }

  /** The root folders: the default ones, then the registered ones; a registered folder renames a default one. */
  async roots(): Promise<FloconFileRoot[]> {
    const registered = new Set(this.registered.map((r) => r.id));
    const defaults: FloconFileRoot[] = [];
    for (const r of await this.defaultRoots()) {
      if (!registered.has(await this.platform.resolvePath(r.path))) defaults.push(r);
    }
    return [...defaults, ...this.registered];
  }

  onConnectedToServer(): void {}

  onMessageReceived(message: FloconMessageFromServer): void {
    void this.handleMessage(message);
  }

  /** Resolves when the operation requested by `message` is done. */
  handleMessage(message: FloconMessageFromServer): Promise<void> {
    let r: Request;
    try {
      r = JSON.parse(message.body);
    } catch {
      return Promise.resolve();
    }
    switch (message.method) {
      case 'get_roots':
        return this.enqueue(() => this.sendRoots(r.requestId));
      case 'list_files':
        this.withFoldersSize = r.withFoldersSize ?? false;
        return this.enqueue(() => this.sendListing(r.path, r.isConstantPath ?? false, r.requestId));
      case 'get_file':
        // not queued: the upload of a big file must not block the listings
        return this.sendFile(r.path, r.requestId);
      case 'delete_file':
        return this.enqueue(async () => {
          await this.deleteItem(r.filePath);
          await this.sendListing(r.parentPath, r.isConstantParentPath ?? false, r.requestId);
        });
      case 'delete_files':
        return this.enqueue(async () => {
          for (const path of r.filePaths ?? []) await this.deleteItem(path);
          await this.sendListing(r.parentPath, r.isConstantParentPath ?? false, r.requestId);
        });
      case 'delete_folder_content':
        return this.enqueue(async () => {
          const folder = await this.resolve(r.path, r.isConstantPath ?? false);
          if (folder && (await this.platform.fileInfo(folder)).isDirectory) {
            for (const child of await this.platform.listDirectory(folder)) await this.deleteItem(child.path);
          }
          await this.sendListing(r.path, r.isConstantPath ?? false, r.requestId);
        });
    }
    return Promise.resolve();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      try {
        await operation();
      } catch (e) {
        FloconLogger.logError('Files request failed', e);
      }
    });
    this.queue = next;
    return next;
  }

  /** The folder or file a desktop path points to, or null if it is outside the roots. */
  private async resolve(path: string, isConstantPath: boolean): Promise<string | null> {
    const roots = await this.roots();
    if (isConstantPath) return roots.find((r) => r.id === path)?.path ?? null;
    if (!FloconPaths.isAbsolute(path)) return null;
    return (await this.within(await this.platform.resolvePath(path), roots)) ? path : null;
  }

  private async within(resolved: string, roots: readonly FloconFileRoot[]): Promise<boolean> {
    for (const root of roots) {
      if (FloconPaths.isWithin(resolved, await this.platform.resolvePath(root.path))) return true;
    }
    return false;
  }

  /** Deletes a file or folder inside the roots. A symbolic link is judged by where it lives, and removed. */
  private async deleteItem(path: string): Promise<void> {
    if (!FloconPaths.isAbsolute(path)) return;
    const normalized = FloconPaths.normalize(path);
    const resolved = FloconPaths.join(
      await this.platform.resolvePath(FloconPaths.dirname(normalized)),
      FloconPaths.basename(normalized),
    );
    const roots = await this.roots();
    const rootPaths = await Promise.all(roots.map((r) => this.platform.resolvePath(r.path)));
    if (!(await this.within(resolved, roots)) || rootPaths.includes(resolved)) {
      FloconLogger.log(`Refused to delete ${path}: outside the app folders or a root folder`);
      return;
    }
    try {
      await this.platform.deleteItem(normalized);
    } catch (e) {
      FloconLogger.logError(`Cannot delete ${path}`, e);
    }
  }

  private async sendRoots(requestId: string): Promise<void> {
    const existing: FloconFileRoot[] = [];
    for (const r of await this.roots()) if ((await this.platform.fileInfo(r.path)).isDirectory) existing.push(r);
    this.sendValue('get_roots', { requestId, roots: existing.map((r) => ({ id: r.id, name: r.name, path: r.path })) });
  }

  private async sendListing(path: string, isConstantPath: boolean, requestId: string): Promise<void> {
    const folder = await this.resolve(path, isConstantPath);
    let files: FloconFileInfo[] = [];
    if (folder && (await this.platform.fileInfo(folder)).isDirectory) {
      files = await this.platform.listDirectory(folder);
      if (this.withFoldersSize) {
        files = await Promise.all(
          files.map(async (f) => (f.isDirectory ? { ...f, size: await this.platform.directorySize(f.path) } : f)),
        );
      }
    }
    files = [...files].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    this.sendValue('list_files', {
      requestId,
      files: files.map((f) => ({
        name: f.name,
        isDirectory: f.isDirectory,
        path: f.path,
        size: f.size,
        lastModified: f.lastModified,
      })),
    });
  }

  private async sendFile(path: string, requestId: string): Promise<void> {
    try {
      const file = await this.resolve(path, false);
      if (!file) return;
      const info = await this.platform.fileInfo(file);
      if (!info.exists || info.isDirectory) return;
      await this.fileSender.sendFile(file, { remotePath: path, requestId });
    } catch (e) {
      FloconLogger.logError(`Cannot send ${path}`, e);
    }
  }

  private sendValue(method: string, value: unknown): void {
    this.sender.send({ plugin: this.pluginName, method, body: JSON.stringify(value) });
  }
}
