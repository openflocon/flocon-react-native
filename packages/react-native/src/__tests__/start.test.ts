import { Flocon, resetFlocon } from '../flocon';
import { FloconTablePlugin } from '../plugins/table/tablePlugin';
import { resetStarted, startFlocon } from '../start';
import { DesktopStub, until } from './support/desktopStub';
import { nodePlatform } from './support/nodePlatform';

let desktop: DesktopStub;

beforeEach(async () => {
  desktop = await DesktopStub.start();
});

afterEach(async () => {
  await resetFlocon();
  resetStarted();
  await desktop.stop();
});

test('Flocon calls are no-ops before startFlocon', async () => {
  expect(Flocon.isInitialized).toBe(false);
  expect(await Flocon.connect('1.2.3.4')).toEqual({ type: 'notStarted' });
  await Flocon.disconnect();
  Flocon.register({ pluginName: 'x', onConnectedToServer() {}, onMessageReceived() {} });
  expect(Flocon.plugin(FloconTablePlugin)).toBeNull();
  Flocon.analytics.sender('firebase').log('event', { a: '1' });
  Flocon.table.table('users').log({ name: 'Flo' });
  Flocon.timeline.logNavigation('Home');
  Flocon.featureFlags.register('p', []);
  Flocon.deeplinks.register([]);
  Flocon.dashboard.dashboard('main', []).dispose();
  Flocon.network.logWebSocketEvent({ websocketUrl: 'wss://x', event: 'open' });
  expect(Flocon.connectionState).toEqual({ type: 'idle' });
});

test('starts once, then installs the factories in order', async () => {
  const order: string[] = [];
  class A {
    async install() {
      order.push(`a:${Flocon.isInitialized}`);
    }
  }
  class B {
    async install() {
      throw new Error('boom');
    }
  }
  class C {
    constructor(readonly name: string) {}
    async install() {
      order.push(this.name);
    }
  }
  await startFlocon(
    (f) => f.connect({ host: 'localhost', webSocketPort: desktop.port }).install(new A()).install(new B()).install(new C('c1')).install(new C('c2')),
    nodePlatform(),
  );
  await startFlocon((f) => f.install(new C('again')), nodePlatform());
  expect(order).toEqual(['a:true', 'c2']);
  await desktop.waitForMessages(1);
  Flocon.table.table('users').log({ name: 'Flo' });
  await desktop.waitForMessages(2);
  expect(desktop.names).toEqual(['bonjour.bonjour', 'table.add_items']);
  await until(() => Flocon.isConnected);
  expect(Flocon.connectionState).toEqual({ type: 'connected' });
});

test('does nothing when the native module is not available (release build, Expo Go)', async () => {
  const installed = jest.fn(async () => {});
  await startFlocon((f) => f.install({ install: installed }), nodePlatform({ isAvailable: false }));
  expect(installed).not.toHaveBeenCalled();
  expect(Flocon.isInitialized).toBe(false);
  expect(Flocon.connectionState).toEqual({ type: 'idle' });
});
