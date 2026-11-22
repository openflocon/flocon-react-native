import { Flocon, type FloconPluginFactory } from '@openflocon/react-native';

import { FloconDatabasePlugin } from './databasePlugin';

export { FloconDatabasePlugin, type FloconDatabaseFile } from './databasePlugin';

/** `Flocon.database`: lists databases and shows the queries the app runs. */
export const FloconDatabaseApi = {
  /** Lists a database in the desktop under `displayName`; a database already listed is renamed. */
  register(displayName: string, path: string): void {
    Flocon.plugin(FloconDatabasePlugin)?.register({ displayName, path });
  },
  /**
   * Shows a query run by the app in the desktop, linked to its database by its path. Call it from the hook of your
   * database library: `Flocon.database.logQuery(db.databasePath, 'SELECT * FROM users WHERE id = ?', [42])`.
   */
  logQuery(databasePath: string, sqlQuery: string, bindArgs: readonly unknown[] = []): void {
    Flocon.plugin(FloconDatabasePlugin)?.logQuery(databasePath, sqlQuery, bindArgs);
  },
};

declare module '@openflocon/react-native' {
  interface FloconApi {
    /** Lists the databases and shows their queries: `Flocon.database.register('Dogs', path)`. From `@openflocon/database`. */
    readonly database: typeof FloconDatabaseApi;
  }
}
Object.defineProperty(Flocon, 'database', { value: FloconDatabaseApi, configurable: true, enumerable: true });

/**
 * The Database plugin, to install with `startFlocon`: the Flocon desktop app browses and queries the SQLite databases
 * of the app, on its own connection.
 *
 * The SQLite files of the usual folders (documents, where expo-sqlite keeps them; the databases folder on Android;
 * application support) are shown without any setup, whatever their extension. Register the others with
 * `Flocon.database.register`. Only the listed databases can be queried.
 */
export class FloconDatabase implements FloconPluginFactory {
  /** `searchDirectories`: the folders searched for SQLite files, instead of the usual ones. */
  constructor(readonly options: { searchDirectories?: string[] } = {}) {}

  async install(): Promise<void> {
    const sender = Flocon.messageSender;
    const platform = Flocon.platform;
    if (!sender || !platform || Flocon.plugin(FloconDatabasePlugin)) return;
    const searchDirectories = async () => {
      if (this.options.searchDirectories) return this.options.searchDirectories;
      const d = await platform.appDirectories();
      return [...new Set([d.databases, d.documents, d.support])];
    };
    Flocon.register(new FloconDatabasePlugin(sender, platform, searchDirectories));
  }
}
