import {
  FloconLogger,
  FloconPaths,
  type FloconMessageFromServer,
  type FloconMessageSender,
  type FloconPlatform,
  type FloconPlugin,
  type FloconSqlResult,
} from '@openflocon/react-native';

/** A SQLite database the desktop can query. Its id, sent to the desktop, is its normalized absolute path. */
export interface FloconDatabaseFile {
  readonly displayName: string;
  readonly path: string;
}

export const databaseId = (path: string): string => FloconPaths.normalize(path);

/**
 * Lets the Flocon desktop app browse and query the SQLite databases of the app, and shows the queries it runs.
 * The desktop asks for the databases (`get_databases`) and runs queries (`query`). Only the listed databases can be
 * queried.
 */
export class FloconDatabasePlugin implements FloconPlugin {
  static readonly pluginName = 'database';
  readonly pluginName = FloconDatabasePlugin.pluginName;
  // by id, so that registering a file again replaces it
  private readonly registered = new Map<string, FloconDatabaseFile>();
  // Queries can be slow: they run in order.
  private queue: Promise<void> = Promise.resolve();
  // The real path of each path given by the app (`/data/data/...` is a link to `/data/user/0/...` on Android)
  private readonly realPaths = new Map<string, Promise<string>>();
  // The queries of the app are sent in the order they were logged
  private logs: Promise<void> = Promise.resolve();

  constructor(
    private readonly sender: FloconMessageSender,
    private readonly platform: FloconPlatform,
    /** The folders searched for SQLite files. */
    private readonly searchDirectories: () => Promise<string[]>,
    private readonly now: () => Date = () => new Date(),
    private readonly maxDepth = 3,
  ) {}

  /** Lists a database, or renames one already listed. */
  register(database: FloconDatabaseFile): void {
    void this.enqueue(async () => {
      const path = await this.realPath(database.path);
      this.registered.set(path, { ...database, path });
      await this.sendDatabases();
    });
  }

  /** The normalized path with its links resolved: the id of the database for the desktop. */
  private realPath(path: string): Promise<string> {
    const normalized = databaseId(path);
    let resolved = this.realPaths.get(normalized);
    if (!resolved) {
      resolved = this.platform.resolvePath(normalized).catch(() => normalized);
      this.realPaths.set(normalized, resolved);
    }
    return resolved;
  }

  /** Shows a query run by the app, linked to its database by its path. */
  logQuery(databasePath: string, sqlQuery: string, bindArgs: readonly unknown[] = []): void {
    const timestamp = this.now().getTime();
    const args = bindArgs.map((a) => (a == null ? 'null' : `${a}`));
    const dbId = this.realPath(databasePath);
    this.logs = this.logs.then(async () => {
      this.sender.send({
        plugin: this.pluginName,
        method: 'log_query',
        body: JSON.stringify({ dbId: await dbId, sqlQuery, bindArgs: args, timestamp }),
      });
    });
  }

  onConnectedToServer(): void {
    void this.enqueue(() => this.sendDatabases());
  }

  onMessageReceived(message: FloconMessageFromServer): void {
    void this.handleMessage(message);
  }

  /** Resolves when the request is answered. */
  handleMessage(message: FloconMessageFromServer): Promise<void> {
    switch (message.method) {
      case 'get_databases':
        return this.enqueue(() => this.sendDatabases());
      case 'query': {
        let request: { query: string; database: string; requestId: string };
        try {
          request = JSON.parse(message.body);
        } catch {
          return Promise.resolve();
        }
        return this.enqueue(() => this.runQuery(request));
      }
    }
    return Promise.resolve();
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      try {
        await operation();
      } catch (e) {
        FloconLogger.logError('Database request failed', e);
      }
    });
    this.queue = next;
    return next;
  }

  /**
   * The discovered databases, a registered one taking the place (and the name) of the one at the same path, then the
   * registered ones elsewhere, if their file exists.
   */
  async databases(): Promise<FloconDatabaseFile[]> {
    const found = new Map<string, FloconDatabaseFile>();
    for (const directory of await this.searchDirectories()) await this.scan(directory, 0, found);
    const discovered = [...found.values()].sort((a, b) =>
      a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()),
    );
    const result = discovered.map((d) => this.registered.get(d.path) ?? d);
    for (const [id, d] of this.registered) {
      if (!found.has(id) && (await this.platform.fileInfo(d.path)).exists) result.push(d);
    }
    return result;
  }

  private async scan(directory: string, depth: number, found: Map<string, FloconDatabaseFile>): Promise<void> {
    for (const entry of await this.platform.listDirectory(directory)) {
      if (entry.isDirectory) {
        if (depth < this.maxDepth) await this.scan(entry.path, depth + 1, found);
      } else if (await this.platform.isSqlite(entry.path)) {
        const path = await this.realPath(entry.path);
        found.set(path, { displayName: entry.name, path });
      }
    }
  }

  private async sendDatabases(): Promise<void> {
    const databases = await this.databases();
    this.sender.send({
      plugin: this.pluginName,
      method: 'get_databases',
      body: JSON.stringify(databases.map((d) => ({ id: databaseId(d.path), name: d.displayName }))),
    });
  }

  private async runQuery(request: { query: string; database: string; requestId: string }): Promise<void> {
    const id = await this.realPath(request.database);
    const known = (await this.databases()).some((d) => databaseId(d.path) === id);
    const result: FloconSqlResult = known
      ? await this.platform.sqliteExecute(id, request.query)
      : { type: 'Error', message: `Unknown database: ${request.database}` };
    this.sender.send({
      plugin: this.pluginName,
      method: 'query',
      body: JSON.stringify({ requestId: request.requestId, result: resultJson(result, request.query) }),
    });
  }
}

/** The format the desktop expects: `{"type": ..., "body": "<json>"}`. */
export function resultJson(result: FloconSqlResult, query: string): string {
  const { type, ...rest } = result;
  const body = type === 'Error' ? { message: (rest as { message: string }).message, originalSql: query } : rest;
  return JSON.stringify({ type, body: JSON.stringify(body) });
}
