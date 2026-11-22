import { Flocon, type FloconPluginFactory } from '@openflocon/react-native';

import { FloconFilesPlugin, type FloconFileRoot } from './filesPlugin';

export { FloconFilesPlugin, type FloconFileRoot } from './filesPlugin';

/** `Flocon.files`: the folders shown in the Files section of the desktop. */
export const FloconFilesApi = {
  /**
   * Shows a folder in the Files section of the Flocon desktop app under `displayName` (a path or a `file://` uri);
   * a folder already shown is renamed. Does nothing before `install(new FloconFiles())`.
   */
  register(displayName: string, path: string): Promise<void> {
    return Flocon.plugin(FloconFilesPlugin)?.register(displayName, path) ?? Promise.resolve();
  },
};

declare module '@openflocon/react-native' {
  interface FloconApi {
    /** Shows folders of the app: `Flocon.files.register('Exports', path)`. From `@openflocon/files`. */
    readonly files: typeof FloconFilesApi;
  }
}
Object.defineProperty(Flocon, 'files', { value: FloconFilesApi, configurable: true, enumerable: true });

/**
 * The Files plugin, to install with `startFlocon`: the Flocon desktop app browses, downloads and deletes the files of
 * the app. Without anything to register, the desktop shows the documents, application support, cache and temporary
 * folders and the whole data folder of the app. Nothing outside of the root folders is reachable.
 */
export class FloconFiles implements FloconPluginFactory {
  /** `defaultRoots`: the folders shown without registering them, instead of the usual ones. */
  constructor(readonly options: { defaultRoots?: FloconFileRoot[] } = {}) {}

  async install(): Promise<void> {
    const sender = Flocon.messageSender;
    const fileSender = Flocon.fileSender;
    const platform = Flocon.platform;
    if (!sender || !fileSender || !platform || Flocon.plugin(FloconFilesPlugin)) return;
    const defaultRoots = async (): Promise<FloconFileRoot[]> => {
      if (this.options.defaultRoots) return this.options.defaultRoots;
      const d = await platform.appDirectories();
      const roots: FloconFileRoot[] = [
        { id: 'documents', name: 'Documents', path: d.documents },
        { id: 'applicationSupport', name: 'Application Support', path: d.support },
        { id: 'caches', name: 'Caches', path: d.caches },
        { id: 'tmp', name: 'tmp', path: d.tmp },
        { id: 'container', name: 'App container', path: d.container },
      ];
      // Android: documents and support are the same folder, caches and tmp too
      return roots.filter((r, i) => roots.findIndex((o) => o.path === r.path) === i);
    };
    Flocon.register(new FloconFilesPlugin(sender, fileSender, platform, defaultRoots));
  }
}
