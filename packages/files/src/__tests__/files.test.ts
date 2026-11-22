import { existsSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { FloconFilesPlugin } from '../filesPlugin';
import { nodePlatform } from '../../../react-native/src/__tests__/support/nodePlatform';

function setup() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'flocon-files-')));
  const docs = join(base, 'docs');
  const outside = join(base, 'outside');
  mkdirSync(join(docs, 'sub'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(docs, 'b.txt'), 'hello');
  writeFileSync(join(docs, 'sub', 'a.txt'), '12345678');
  writeFileSync(join(outside, 'secret.txt'), 'no');
  symlinkSync(outside, join(docs, 'escape'));
  const platform = nodePlatform();
  const sent: { method: string; body: any }[] = [];
  const uploads: [string, string][] = [];
  const plugin = new FloconFilesPlugin(
    { send: (m) => sent.push({ method: m.method, body: JSON.parse(m.body) }) },
    {
      sendFile: async (path, o) => {
        uploads.push([path, o.requestId]);
      },
    },
    platform,
    async () => [{ id: 'documents', name: 'Documents', path: docs }],
  );
  const msg = (method: string, body: object) => plugin.handleMessage({ plugin: 'files', method, body: JSON.stringify(body) });
  return { base, docs, outside, plugin, sent, uploads, msg };
}

test('lists the roots and a folder, sorted, with the sizes of the folders when asked', async () => {
  const { docs, sent, msg, plugin } = setup();
  await plugin.register('Exports', join(docs, 'sub'));
  await msg('get_roots', { requestId: 'r0' });
  expect(sent[0].body.roots.map((r: any) => r.name)).toEqual(['Documents', 'Exports']);
  await msg('list_files', { requestId: 'r1', path: 'documents', isConstantPath: true, withFoldersSize: true });
  const listing = sent[1].body;
  expect(listing.requestId).toBe('r1');
  expect(listing.files.map((f: any) => [f.name, f.isDirectory, f.size])).toEqual([
    ['b.txt', false, 5],
    ['escape', false, expect.any(Number)],
    ['sub', true, 8],
  ]);
});

test('refuses the paths outside the roots, symbolic links resolved', async () => {
  const { docs, outside, sent, uploads, msg } = setup();
  await msg('list_files', { requestId: 'r', path: outside, isConstantPath: false });
  expect(sent[0].body.files).toEqual([]);
  await msg('list_files', { requestId: 'r', path: join(docs, 'escape'), isConstantPath: false });
  expect(sent[1].body.files).toEqual([]);
  await msg('get_file', { requestId: 'r', path: join(outside, 'secret.txt') });
  await msg('get_file', { requestId: 'r2', path: join(docs, 'b.txt') });
  expect(uploads).toEqual([[join(docs, 'b.txt'), 'r2']]);
});

test('deletes inside the roots only, never a root, a link and not its target', async () => {
  const { docs, outside, msg, sent } = setup();
  await msg('delete_file', { requestId: 'r', filePath: join(outside, 'secret.txt'), parentPath: 'documents', isConstantParentPath: true });
  await msg('delete_file', { requestId: 'r', filePath: docs, parentPath: 'documents', isConstantParentPath: true });
  await msg('delete_files', { requestId: 'r', filePaths: [join(docs, 'escape'), join(docs, 'b.txt')], parentPath: 'documents', isConstantParentPath: true });
  expect(existsSync(join(outside, 'secret.txt'))).toBe(true);
  expect(existsSync(docs)).toBe(true);
  expect(existsSync(join(docs, 'escape'))).toBe(false);
  expect(existsSync(join(docs, 'b.txt'))).toBe(false);
  await msg('delete_folder_content', { requestId: 'r9', path: 'documents', isConstantPath: true });
  expect(existsSync(join(docs, 'sub'))).toBe(false);
  expect(sent[sent.length - 1].body).toEqual({ requestId: 'r9', files: [] });
});
