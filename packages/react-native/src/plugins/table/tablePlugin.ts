import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';
import { uuidV4 } from '../../core/uuid';

/** The value of one column in a row of a table. */
export interface TableColumnConfig {
  readonly columnName: string;
  readonly value: string;
}

export type TableColumns = readonly TableColumnConfig[] | Readonly<Record<string, string>>;

const toColumns = (c: TableColumns): TableColumnConfig[] =>
  Array.isArray(c)
    ? [...(c as TableColumnConfig[])]
    : Object.entries(c).map(([columnName, value]) => ({ columnName, value }));

/** Sends table rows to the Flocon desktop app. */
export class FloconTablePlugin implements FloconPlugin {
  static readonly pluginName = 'table';
  readonly pluginName = FloconTablePlugin.pluginName;

  constructor(private readonly sender: FloconMessageSender) {}

  onConnectedToServer(): void {}
  onMessageReceived(): void {}

  registerTable(tableName: string, columns: TableColumns, o: { id?: string; createdAt?: Date } = {}): void {
    // the desktop expects a JSON array, even for a single row
    this.sender.send({
      plugin: this.pluginName,
      method: 'add_items',
      body: JSON.stringify([
        {
          id: o.id ?? uuidV4(),
          name: tableName,
          createdAt: (o.createdAt ?? new Date()).getTime(),
          columns: toColumns(columns).map((c) => ({ column: c.columnName, value: c.value })),
        },
      ]),
    });
  }
}

/** Logs rows in a table of the Flocon desktop app. Columns are created from the names used in the logged rows. */
export class FloconTable {
  constructor(readonly tableName: string) {}

  /** Does nothing before `startFlocon`. */
  log(columns: TableColumns, o: { id?: string } = {}): void {
    currentClient()?.plugin(FloconTablePlugin)?.registerTable(this.tableName, columns, o);
  }
}

/** Entry point of the tables: `Flocon.table.table('users').log({ name: 'Florent', age: '33' })`. */
export const FloconTables = {
  table: (tableName: string): FloconTable => new FloconTable(tableName),
};
