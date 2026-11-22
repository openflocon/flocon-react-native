import { FloconPreferencesPlugin } from '../preferencesPlugin';
import { asyncStoragePreference } from '../preference';

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getAllKeys: async () => [...data.keys()],
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}

function setup() {
  const sent: { method: string; body: any }[] = [];
  const plugin = new FloconPreferencesPlugin({ send: (m) => sent.push({ method: m.method, body: JSON.parse(m.body) }) });
  const storage = memoryStorage({ token: 'abc', count: '3' });
  plugin.registerAndNotify(asyncStoragePreference(storage));
  return { sent, plugin, storage };
}

const request = (method: string, body: object) => ({ plugin: 'shared_preferences', method, body: JSON.stringify(body) });

test('the list of stores is sent on register and on each connection', () => {
  const { sent, plugin } = setup();
  plugin.onConnectedToServer();
  expect(sent).toEqual([
    { method: 'get_shared_preferences', body: [{ name: 'AsyncStorage', type: 'AsyncStorage' }] },
    { method: 'get_shared_preferences', body: [{ name: 'AsyncStorage', type: 'AsyncStorage' }] },
  ]);
});

test('the content of a store is sent sorted, as strings', async () => {
  const { sent, plugin } = setup();
  await plugin.handleMessage(request('get_shared_preference_value', { requestId: 'r', sharedPreferenceName: 'AsyncStorage' }));
  expect(sent[1]).toEqual({
    method: 'get_shared_preference_value',
    body: {
      requestId: 'r',
      sharedPreferenceName: 'AsyncStorage',
      rows: [
        { key: 'count', stringValue: '3' },
        { key: 'token', stringValue: 'abc' },
      ],
    },
  });
});

test('edits and removals from the desktop are applied, then the content is sent again', async () => {
  const { sent, plugin, storage } = setup();
  await plugin.handleMessage(
    request('set_shared_preference_value', { requestId: 'r', sharedPreferenceName: 'AsyncStorage', key: 'token', stringValue: 'new' }),
  );
  await plugin.handleMessage(
    request('remove_shared_preference_value', { requestId: 'r2', sharedPreferenceName: 'AsyncStorage', key: 'count' }),
  );
  await plugin.handleMessage(request('set_shared_preference_value', { sharedPreferenceName: 'Unknown', key: 'x' }));
  await plugin.handleMessage({ plugin: 'shared_preferences', method: 'set_shared_preference_value', body: 'broken' });
  expect(Object.fromEntries(storage.data)).toEqual({ token: 'new' });
  expect(sent.map((s) => s.body.requestId).slice(1)).toEqual(['r', 'r2']);
});
