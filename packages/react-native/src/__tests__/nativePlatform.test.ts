jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));

import { createNativePlatform, nativePlatform } from '../platform/nativePlatform';

function fakeModule() {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const sent: [number, string][] = [];
  return {
    sent,
    emit: (event: string, e: object) => listeners[event]?.forEach((l) => l(e)),
    module: {
      isAvailable: true,
      openWebSocket: jest.fn(async (id: number, url: string) => {
        if (url.includes('down')) throw new Error('unreachable');
      }),
      send: (id: number, text: string) => {
        sent.push([id, text]);
        return true;
      },
      close: jest.fn(async () => {}),
      upload: jest.fn(async () => {}),
      appInfos: jest.fn(),
      appIconBase64Png: jest.fn(),
      readStorageFile: jest.fn(),
      writeStorageFile: jest.fn(),
      deleteStorageFile: jest.fn(),
      addListener: (event: string, l: (e: any) => void) => {
        (listeners[event] ??= []).push(l);
        return { remove() {} };
      },
    },
  };
}

test('without the native module (Expo Go, not rebuilt) Flocon is not available', () => {
  expect(nativePlatform.isAvailable).toBe(false);
  expect(createNativePlatform({ ...fakeModule().module, isAvailable: false } as never).isAvailable).toBe(false);
});

test('routes the events of each socket to its own handlers, onClosed once, not after close()', async () => {
  const fake = fakeModule();
  const platform = createNativePlatform(fake.module as never);
  const got: string[] = [];
  const one = await platform.openWebSocket('wss://a', { onMessage: (t) => got.push(`1:${t}`), onClosed: () => got.push('1:closed') });
  const two = await platform.openWebSocket('wss://b', { onMessage: (t) => got.push(`2:${t}`), onClosed: () => got.push('2:closed') });
  expect(fake.module.openWebSocket.mock.calls.map((c) => c.slice(0, 3))).toEqual([
    [1, 'wss://a', 5000],
    [2, 'wss://b', 5000],
  ]);
  fake.emit('onMessage', { id: 2, text: 'hi' });
  fake.emit('onClosed', { id: 1 });
  fake.emit('onClosed', { id: 1 });
  await two.close();
  fake.emit('onClosed', { id: 2 });
  expect(got).toEqual(['2:hi', '1:closed']);
  expect(one.send('x')).toBe(false);
  expect(two.send('x')).toBe(false);
  expect(fake.sent).toEqual([]);
});

test('a socket that cannot open rejects', async () => {
  const platform = createNativePlatform(fakeModule().module as never);
  await expect(platform.openWebSocket('wss://down', { onMessage() {}, onClosed() {} })).rejects.toThrow('unreachable');
});
