import type { FloconAddressStore } from '../client/addressStore';
import { FloconConnectionStateStore, type FloconConnectionState } from '../client/connectionState';
import { FloconConnections } from '../client/connections';
import { FloconClient } from '../client/floconClient';
import { defaultConfig } from '../config';
import type { FloconPlugin } from '../core/plugin';
import type { FloconMessageFromServer } from '../model/messages';
import { FLOCON_SDK_VERSION } from '../version';
import { DesktopStub, until } from './support/desktopStub';
import { nodePlatform } from './support/nodePlatform';

class MemoryStore implements FloconAddressStore {
  address: string | null = null;
  load = async () => this.address;
  save = async (a: string) => {
    this.address = a;
  };
  clear = async () => {
    this.address = null;
  };
}

class Echo implements FloconPlugin {
  readonly pluginName = 'echo';
  readonly messages: FloconMessageFromServer[] = [];
  connectedCount = 0;
  onConnectedToServer() {
    this.connectedCount++;
  }
  onMessageReceived(m: FloconMessageFromServer) {
    this.messages.push(m);
  }
}

let desktop: DesktopStub;
let second: DesktopStub;
let client: FloconClient;
let connections: FloconConnections;
let states: FloconConnectionStateStore;
let store: MemoryStore;

async function boot(o: { additionalAddress?: string; remembered?: string; port?: number; rememberLastAddress?: boolean } = {}) {
  const config = {
    ...defaultConfig,
    host: 'localhost',
    webSocketPort: o.port ?? desktop.port,
    httpPort: 1,
    additionalAddress: o.additionalAddress,
    rememberLastAddress: o.rememberLastAddress ?? true,
  };
  client = new FloconClient(config, nodePlatform());
  states = new FloconConnectionStateStore();
  store = new MemoryStore();
  store.address = o.remembered ?? null;
  connections = new FloconConnections({ client, states, config: client.config, addressStore: store, retryDelayMs: 50 });
  await connections.start();
}

beforeEach(async () => {
  desktop = await DesktopStub.start();
  second = await DesktopStub.start();
});

afterEach(async () => {
  await connections?.stop();
  await desktop.stop();
  await second.stop();
});

test('connects over wss with the self-signed certificate, introduces the app, then sends what was kept', async () => {
  await boot();
  client.send({ plugin: 'table', method: 'add_items', body: '[]' });
  client.send({ plugin: 'analytics', method: 'add_items', body: '[]' });
  await desktop.waitForMessages(3);
  expect(desktop.names).toEqual(['bonjour.bonjour', 'table.add_items', 'analytics.add_items']);
  const hello = desktop.received[0];
  expect(JSON.parse(hello.body)).toEqual({ sdk: 'react-native', connectionType: 'default' });
  expect(Object.keys(hello).sort()).toEqual(
    ['deviceId', 'plugin', 'body', 'appName', 'appPackageName', 'method', 'deviceName', 'appInstance', 'platform', 'versionName'].sort(),
  );
  expect([hello.deviceId, hello.appName, hello.appPackageName, hello.platform, hello.versionName]).toEqual([
    'dev',
    'App',
    'io.app',
    'ios',
    FLOCON_SDK_VERSION,
  ]);
  expect(typeof hello.appInstance).toBe('number');
  expect(states.state.type).toBe('connected');
  expect(client.isConnected).toBe(true);
});

test('starts with no desktop reachable without rejecting, keeps trying, keeping what was logged', async () => {
  const port = desktop.port;
  await desktop.stop();
  const unhandled = jest.fn();
  process.on('unhandledRejection', unhandled);
  await boot({ port });
  client.send({ plugin: 'table', method: 'add_items', body: '[1]' });
  await until(() => states.state.type === 'failed');
  await until(() => client.outbox.bufferedCount === 1);
  desktop = await DesktopStub.start(port);
  await desktop.waitForMessages(2);
  expect(desktop.names).toEqual(['bonjour.bonjour', 'table.add_items']);
  expect(states.state.type).toBe('connected');
  process.off('unhandledRejection', unhandled);
  expect(unhandled).not.toHaveBeenCalled();
});

test('reconnects after the desktop restarts and sends the buffered messages once, in order', async () => {
  const port = desktop.port;
  await boot();
  await desktop.waitForMessages(1);
  await until(() => states.state.type === 'connected');
  const seen: FloconConnectionState['type'][] = [];
  states.subscribe((s) => seen.push(s.type));
  await desktop.stop();
  await until(() => !client.isConnected);
  for (const i of [1, 2, 3]) client.send({ plugin: 'table', method: 'add_items', body: `[${i}]` });
  desktop = await DesktopStub.start(port);
  await desktop.waitForMessages(4);
  await new Promise((r) => setTimeout(r, 100));
  expect(desktop.names).toEqual(['bonjour.bonjour', 'table.add_items', 'table.add_items', 'table.add_items']);
  expect(desktop.received.slice(1).map((m) => m.body)).toEqual(['[1]', '[2]', '[3]']);
  expect(seen[0]).toBe('connected');
  expect(seen).toContain('buffering');
  expect(seen[seen.length - 1]).toBe('connected');
});

test('routes the desktop messages to the plugin, whatever the case, and calls onConnectedToServer', async () => {
  await boot();
  const echo = new Echo();
  client.register(echo);
  await desktop.waitForMessages(1);
  desktop.send('Echo', 'do_it', '{"a":1}');
  desktop.sockets[0].send('not json');
  await until(() => echo.messages.length === 1);
  expect([echo.messages[0].method, echo.messages[0].body]).toEqual(['do_it', '{"a":1}']);
  desktop.dropConnections();
  await until(() => echo.connectedCount === 1);
});

test('answers get_app_icon by itself', async () => {
  await boot();
  await desktop.waitForMessages(1);
  desktop.send('device', 'get_app_icon');
  await desktop.waitForMessages(2);
  expect(desktop.names[1]).toBe('device.app_icon');
  expect(desktop.received[1].body).toBe('ICON');
});

describe('connect(address)', () => {
  test('adds an address as wifi, both desktops then get the messages', async () => {
    await boot();
    await desktop.waitForMessages(1);
    expect(await connections.connect(`localhost:${second.port}:1`)).toEqual({ type: 'connected' });
    await second.waitForMessages(1);
    expect(JSON.parse(second.received[0].body)).toEqual({ sdk: 'react-native', connectionType: 'wifi' });
    client.send({ plugin: 'table', method: 'add_items', body: '[4]' });
    await Promise.all([desktop.waitForMessages(2), second.waitForMessages(2)]);
    expect(desktop.received[1].body).toBe('[4]');
    expect(second.received[1].body).toBe('[4]');
    expect(store.address).toBe(`localhost:${second.port}:1`);
  });

  test('reports an invalid or unreachable address instead of rejecting', async () => {
    await boot();
    const invalid = await connections.connect('http://x');
    expect(invalid.type).toBe('invalidAddress');
    expect((await connections.connect('localhost:1:2')).type).toBe('failed');
    expect(client.extraLink).toBeNull();
    await until(() => client.defaultLink.isConnected);
  });

  test('the default address is not added twice', async () => {
    await boot();
    await until(() => client.defaultLink.isConnected);
    expect(await connections.connect(`localhost:${desktop.port}:1`)).toEqual({ type: 'connected' });
    expect(client.extraLink).toBeNull();
  });

  test('disconnect closes the added connection and forgets its address', async () => {
    await boot();
    await connections.connect(`localhost:${second.port}:1`);
    expect(client.extraLink).not.toBeNull();
    await connections.disconnect();
    expect(client.extraLink).toBeNull();
    expect(store.address).toBeNull();
    await until(() => second.sockets.every((s) => s.readyState !== s.OPEN));
  });

  test('serializes concurrent connect and disconnect', async () => {
    await boot();
    const a = connections.connect(`localhost:${second.port}:1`);
    const b = connections.connect('localhost:1:2');
    const c = connections.disconnect();
    await Promise.all([a, b, c]);
    expect(client.extraLink).toBeNull();
    expect(store.address).toBeNull();
  });

  test('the last address comes back at the next launch and wins', async () => {
    await boot({ remembered: `localhost:${second.port}:1`, additionalAddress: 'localhost:1:1' });
    await second.waitForMessages(1);
    expect(JSON.parse(second.received[0].body)).toEqual({ sdk: 'react-native', connectionType: 'wifi' });
    expect(client.extraLink?.address.webSocketPort).toBe(second.port);
  });

  test('rememberLastAddress false neither saves nor loads', async () => {
    await boot({ remembered: `localhost:${second.port}:1`, rememberLastAddress: false });
    expect(client.extraLink).toBeNull();
    store.address = null;
    await connections.connect(`localhost:${second.port}:1`);
    expect(store.address).toBeNull();
  });
});
