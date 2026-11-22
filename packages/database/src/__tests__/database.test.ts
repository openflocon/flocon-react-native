import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { FloconDatabasePlugin, resultJson } from '../databasePlugin';
import { nodePlatform } from '../../../react-native/src/__tests__/support/nodePlatform';

const SQLITE = Buffer.concat([Buffer.from('SQLite format 3\u0000', 'latin1'), Buffer.alloc(100)]);

function setup() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'flocon-db-')));
  mkdirSync(join(dir, 'SQLite'));
  writeFileSync(join(dir, 'SQLite', 'dogs.db'), SQLITE);
  writeFileSync(join(dir, 'notes.txt'), 'hello');
  const queries: [string, string][] = [];
  const platform = nodePlatform({
    sqliteExecute: async (path, query) => {
      queries.push([path, query]);
      return query.startsWith('SELECT')
        ? { type: 'Select', columns: ['name'], values: [['Rex'], [null]] }
        : { type: 'Error', message: 'near "x": syntax error' };
    },
  });
  const sent: { method: string; body: any }[] = [];
  const plugin = new FloconDatabasePlugin(
    { send: (m) => sent.push({ method: m.method, body: JSON.parse(m.body) }) },
    platform,
    async () => [dir],
    () => new Date(7),
  );
  return { dir, plugin, sent, queries };
}

test('lists the SQLite files of the folders, whatever their extension, and the registered ones', async () => {
  const { dir, plugin, sent } = setup();
  writeFileSync(join(dir, 'other.sqlite'), SQLITE);
  plugin.register({ displayName: 'Renamed', path: join(dir, 'SQLite', 'dogs.db') });
  plugin.register({ displayName: 'Missing', path: join(dir, 'missing.db') });
  await plugin.handleMessage({ plugin: 'database', method: 'get_databases', body: '' });
  expect(sent[sent.length - 1]).toEqual({
    method: 'get_databases',
    body: [
      { id: join(dir, 'SQLite', 'dogs.db'), name: 'Renamed' },
      { id: join(dir, 'other.sqlite'), name: 'other.sqlite' },
    ],
  });
});

test('runs the queries of the desktop on the listed databases only', async () => {
  const { dir, plugin, sent, queries } = setup();
  const path = join(dir, 'SQLite', 'dogs.db');
  await plugin.handleMessage({ plugin: 'database', method: 'query', body: JSON.stringify({ requestId: 'r', database: path, query: 'SELECT name FROM dogs' }) });
  await plugin.handleMessage({ plugin: 'database', method: 'query', body: JSON.stringify({ requestId: 'r2', database: '/etc/hosts', query: 'SELECT 1' }) });
  expect(queries).toEqual([[path, 'SELECT name FROM dogs']]);
  const [first, second] = sent.map((s) => ({ ...s.body, result: JSON.parse(s.body.result) }));
  expect(first.requestId).toBe('r');
  expect(JSON.parse(first.result.body)).toEqual({ columns: ['name'], values: [['Rex'], [null]] });
  expect(first.result.type).toBe('Select');
  expect(second.result.type).toBe('Error');
  expect(JSON.parse(second.result.body)).toEqual({ message: 'Unknown database: /etc/hosts', originalSql: 'SELECT 1' });
});

test('errors keep the query, queries of the app are logged', async () => {
  expect(JSON.parse(resultJson({ type: 'Error', message: 'bad' }, 'SELEC'))).toEqual({
    type: 'Error',
    body: JSON.stringify({ message: 'bad', originalSql: 'SELEC' }),
  });
  const { plugin, sent } = setup();
  plugin.logQuery('/data/a/../b.db', 'SELECT * FROM t WHERE id = ?', [42, null]);
  await new Promise((r) => setTimeout(r, 10));
  expect(sent[0]).toEqual({
    method: 'log_query',
    body: { dbId: '/data/b.db', sqlQuery: 'SELECT * FROM t WHERE id = ?', bindArgs: ['42', 'null'], timestamp: 7 },
  });
});

test('a database given through a link is the same as the discovered one', async () => {
  const { dir, plugin, sent } = setup();
  symlinkSync(dir, join(dir, '..', `${dir.split('/').pop()}-link`));
  const linked = join(dir, '..', `${dir.split('/').pop()}-link`, 'SQLite', 'dogs.db');
  plugin.register({ displayName: 'Dogs', path: linked });
  plugin.logQuery(linked, 'SELECT 1');
  await plugin.handleMessage({ plugin: 'database', method: 'get_databases', body: '' });
  await new Promise((r) => setTimeout(r, 10));
  const databases = sent.filter((s) => s.method === 'get_databases').pop()!.body;
  expect(databases).toEqual([{ id: join(dir, 'SQLite', 'dogs.db'), name: 'Dogs' }]);
  expect(sent.find((s) => s.method === 'log_query')!.body.dbId).toBe(join(dir, 'SQLite', 'dogs.db'));
});
