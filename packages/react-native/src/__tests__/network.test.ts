import { FloconNetworkPlugin } from '../plugins/network/networkPlugin';
import { errorKindOf, parseBadQualityConfig, parseMocks } from '../plugins/network/networkOverrides';
import type { FloconNetworkStore } from '../plugins/network/networkStore';
import { recordingSender } from './support/nodePlatform';

const mockJson = (urlPattern: string, method: string, response: object) => ({ expectation: { urlPattern, method }, response });

function plugin(o: { random?: number[]; store?: FloconNetworkStore } = {}) {
  const delays: number[] = [];
  const randoms = [...(o.random ?? [])];
  const sender = recordingSender();
  const p = new FloconNetworkPlugin({
    sender,
    store: o.store,
    random: () => randoms.shift() ?? 0.5,
    delay: async (ms) => {
      delays.push(ms);
    },
  });
  return { p, delays, sender };
}

function memoryStore(initial: { mocks?: string; bad?: string } = {}) {
  const files: { mocks: string | null; bad: string | null } = { mocks: initial.mocks ?? null, bad: initial.bad ?? null };
  const store: FloconNetworkStore = {
    loadMocks: async () => files.mocks,
    loadBadNetworkConfig: async () => files.bad,
    saveMocks: async (j) => {
      files.mocks = j;
    },
    saveBadNetworkConfig: async (j) => {
      files.bad = j;
    },
  };
  return { store, files };
}

const badConfig = (o: Partial<{ trigger: number; min: number; max: number; errorProbability: number; errors: object[] }>) =>
  JSON.stringify({
    latency: { latencyTriggerProbability: o.trigger ?? 0, minLatencyMs: o.min ?? 0, maxLatencyMs: o.max ?? 0 },
    errorProbability: o.errorProbability ?? 0,
    errors: o.errors ?? [],
  });

test('setup_mocks parses body mocks and error mocks, ignoring invalid entries', () => {
  const mocks = parseMocks(
    JSON.stringify([
      mockJson('https://a/.*', 'GET', { httpCode: 200, body: '{}', mediaType: 'application/json', delay: 10, headers: { x: 1 } }),
      mockJson('https://b', '*', { errorException: 'java.net.SocketTimeoutException' }),
      mockJson('https://c', 'GET', {}),
    ]),
  );
  expect(mocks).toHaveLength(2);
  expect(mocks[0]).toMatchObject({ httpCode: 200, body: '{}', mediaType: 'application/json', delayMs: 10, headers: { x: '1' } });
  expect(mocks[1].errorException).toBe('java.net.SocketTimeoutException');
  expect(parseMocks('nope')).toEqual([]);
});

test('the url pattern must match the whole url, the method is case-insensitive or a wildcard', () => {
  const { p } = plugin();
  p.onMessageReceived({
    plugin: 'network',
    method: 'setup_mocks',
    body: JSON.stringify([mockJson('https://api\\.x/users/\\d+', 'post', { httpCode: 201 }), mockJson('(', '*', { httpCode: 1 })]),
  });
  expect(p.findMock('https://api.x/users/12', 'POST')).not.toBeNull();
  expect(p.findMock('https://api.x/users/12?a=1', 'POST')).toBeNull();
  expect(p.findMock('https://api.x/users/12', 'GET')).toBeNull();
});

test('findMock returns the first match, applyOverride waits for the delay', async () => {
  const { p, delays } = plugin();
  p.mocks = parseMocks(
    JSON.stringify([mockJson('.*', 'GET', { httpCode: 500, body: 'first', delay: 300 }), mockJson('.*', 'GET', { httpCode: 200 })]),
  );
  const override = await p.applyOverride(p.findMock('https://x', 'GET'));
  expect(override).toMatchObject({ type: 'response', statusCode: 500, body: 'first', isMocked: true });
  expect(delays).toEqual([300]);
});

test('no configuration lets the call through', async () => {
  expect(await plugin().p.applyOverride(null)).toBeNull();
});

test('latency is applied within the configured bounds, then the call goes through', async () => {
  const { p, delays } = plugin({ random: [0.99, 0.5] });
  p.badQualityConfig = parseBadQualityConfig(badConfig({ trigger: 0.5, min: 100, max: 200 }));
  expect(await p.applyOverride(null)).toBeNull();
  expect(delays).toEqual([]);
  const second = plugin({ random: [0.1, 0.5] });
  second.p.badQualityConfig = parseBadQualityConfig(badConfig({ trigger: 0.5, min: 100, max: 200 }));
  await second.p.applyOverride(null);
  expect(second.delays).toEqual([150]);
});

test('errors are picked by weight and are not flagged as mocked; a mock wins over the simulation', async () => {
  const errors = [
    { weight: 1, errorCode: 500, errorBody: 'down', errorContentType: 'text/plain' },
    { weight: 3, errorException: 'java.io.IOException: connect failed' },
  ];
  const { p } = plugin({ random: [0.1, 0.9] });
  p.badQualityConfig = parseBadQualityConfig(badConfig({ errorProbability: 0.5, errors }));
  expect(await p.applyOverride(null)).toEqual({
    type: 'error',
    className: 'java.io.IOException: connect failed',
    kind: 'connection',
    isMocked: false,
  });
  const mocked = plugin({ random: [0.1, 0.1] });
  mocked.p.badQualityConfig = parseBadQualityConfig(badConfig({ errorProbability: 1, errors }));
  mocked.p.mocks = parseMocks(JSON.stringify([mockJson('.*', '*', { httpCode: 204 })]));
  expect(await mocked.p.applyOverride(mocked.p.findMock('u', 'GET'))).toMatchObject({ statusCode: 204, isMocked: true });
});

test('unreadable configuration disables the simulation, error kinds', () => {
  expect(parseBadQualityConfig('{}')).toBeNull();
  expect(parseBadQualityConfig('x')).toBeNull();
  expect(errorKindOf('java.net.SocketTimeoutException')).toBe('timeout');
  expect(errorKindOf('java.net.UnknownHostException')).toBe('connection');
  expect(errorKindOf('java.lang.IllegalStateException')).toBe('unknown');
});

test('the mocks and the bad network configuration come back at the next launch', async () => {
  const saved = memoryStore();
  const first = plugin({ store: saved.store });
  await first.p.ready;
  const mocks = JSON.stringify([mockJson('.*', 'GET', { httpCode: 200 })]);
  first.p.onMessageReceived({ plugin: 'network', method: 'setup_mocks', body: mocks });
  first.p.onMessageReceived({ plugin: 'network', method: 'setup_bad_network_config', body: badConfig({ trigger: 1 }) });
  await new Promise((r) => setTimeout(r, 0));
  const next = plugin({ store: saved.store });
  await next.p.ready;
  expect(next.p.mocks).toHaveLength(1);
  expect(next.p.badQualityConfig?.latencyTriggerProbability).toBe(1);
  next.p.onMessageReceived({ plugin: 'network', method: 'setup_mocks', body: '[]' });
  next.p.onMessageReceived({ plugin: 'network', method: 'setup_bad_network_config', body: 'broken' });
  await new Promise((r) => setTimeout(r, 0));
  expect(saved.files).toEqual({ mocks: '[]', bad: null });
});

test('requests and responses are sent with explicit nulls, WebSocket events with their size', () => {
  const { p, sender } = plugin();
  p.logRequest({ callId: 'c', url: 'u', method: 'GET', startTime: 1, requestHeaders: {} });
  p.logResponse({ callId: 'c', durationMs: 2, httpCode: 200 });
  p.logWebSocketEvent({ websocketUrl: 'wss://x', event: 'receiveMessage', message: 'héllo', timestamp: new Date(3) });
  expect(sender.messages.map((m) => m.method)).toEqual(['log_network_call_request', 'log_network_call_response', 'log_websocket_event']);
  const [request, response, ws] = sender.bodies();
  expect(request).toEqual({
    floconCallId: 'c',
    floconNetworkType: 'http',
    url: 'u',
    method: 'GET',
    startTime: 1,
    requestHeaders: {},
    requestBody: null,
    requestSize: null,
    isMocked: false,
  });
  expect(response).toMatchObject({ responseHttpCode: 200, responseBody: null, responseGrpcStatus: null, responseError: null, isImage: false });
  expect(ws).toMatchObject({ event: 'received', url: 'wss://x', size: 6, timestamp: 3, message: 'héllo', error: null });
});

test('isImage uses the content type or the option, shouldLog the option', () => {
  const { p } = plugin();
  const req = { url: 'https://img/1', method: 'GET', headers: {} };
  expect(p.isImage(req, { headers: { 'content-type': 'image/png' } })).toBe(true);
  expect(p.isImage(req, { headers: {} })).toBe(false);
  p.options = { isImage: (r) => r.url.startsWith('https://img'), shouldLog: (r) => r.method !== 'HEAD' };
  expect(p.isImage(req, { headers: {} })).toBe(true);
  expect(p.shouldLog({ ...req, method: 'HEAD' })).toBe(false);
});
