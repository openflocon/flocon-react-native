import { FloconConnectionStateStore, type FloconConnectionState } from '../client/connectionState';

test('publishes connected first, then connecting, then failed', () => {
  const store = new FloconConnectionStateStore();
  const seen: FloconConnectionState[] = [];
  const stop = store.subscribe((s) => seen.push(s));
  store.set({ type: 'failed', reason: 'x' }, 1);
  store.set({ type: 'connecting' }, 2);
  store.set({ type: 'connected' }, 1);
  store.set({ type: 'connected' }, 2);
  store.set({ type: 'failed', reason: 'y' }, 2);
  expect(seen.map((s) => s.type)).toEqual(['idle', 'failed', 'connecting', 'connected']);
  stop();
  store.clear(1);
  expect(seen).toHaveLength(4);
  expect(store.state).toEqual({ type: 'failed', reason: 'y' });
});

test('a new failure reason is published again', () => {
  const store = new FloconConnectionStateStore();
  const seen: FloconConnectionState[] = [];
  store.subscribe((s) => seen.push(s));
  store.set({ type: 'failed', reason: 'a' }, 1);
  store.set({ type: 'failed', reason: 'a' }, 1);
  store.set({ type: 'failed', reason: 'b' }, 1);
  expect(seen.slice(1)).toEqual([
    { type: 'failed', reason: 'a' },
    { type: 'failed', reason: 'b' },
  ]);
});
