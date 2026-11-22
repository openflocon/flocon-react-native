import { Flocon, resetFlocon } from '../flocon';
import { describeRequest, installFetchInterceptor, uninstallFetchInterceptor } from '../plugins/network/fetchInterceptor';
import { FloconNetwork } from '../plugins/network/floconNetwork';
import { FloconNetworkPlugin } from '../plugins/network/networkPlugin';
import { uninstallXhrInterceptor } from '../plugins/network/xhrInterceptor';
import { resetStarted, startFlocon } from '../start';
import { until } from './support/desktopStub';
import { nodePlatform } from './support/nodePlatform';

let target: { fetch: any };
let calls: string[];
let sent: { method: string; body: any }[];

beforeEach(async () => {
  calls = [];
  const nativeFetch = async (input: any) => {
    calls.push(String(input));
    if (String(input).includes('down')) throw new TypeError('Network request failed');
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  target = { fetch: nativeFetch };
  await startFlocon((f) => f.install(new FloconNetwork()), nodePlatform({ openWebSocket: () => new Promise(() => {}) }));
  uninstallXhrInterceptor();
  // FloconNetwork wrapped the fetch of Node: wrap the fake one instead
  uninstallFetchInterceptor();
  installFetchInterceptor(target);
  sent = [];
  jest.spyOn(Flocon.messageSender!, 'send').mockImplementation((m) => {
    sent.push({ method: m.method, body: JSON.parse(m.body) });
  });
});

afterEach(async () => {
  uninstallFetchInterceptor();
  await resetFlocon();
  resetStarted();
});

test('logs a real call, the app still reads the body', async () => {
  const response = await target.fetch('https://api.x/users', { method: 'post', headers: { Accept: 'json' }, body: '{"a":1}' });
  expect(await response.json()).toEqual({ ok: true });
  await until(() => sent.length === 2);
  expect(sent[0].body).toMatchObject({ url: 'https://api.x/users', method: 'POST', requestHeaders: { accept: 'json' }, requestBody: '{"a":1}' });
  expect(sent[1].body).toMatchObject({ responseHttpCode: 200, responseBody: '{"ok":true}', responseContentType: 'application/json' });
});

test('a mock answers without calling the network, a mocked error rejects like fetch', async () => {
  const network = Flocon.plugin(FloconNetworkPlugin)!;
  network.mocks = [
    { urlPattern: '.*/profile', method: 'GET', delayMs: 0, httpCode: 503, body: 'down', mediaType: 'text/plain', headers: {} },
    { urlPattern: '.*/timeout', method: '*', delayMs: 0, body: '', mediaType: '', headers: {}, errorException: 'java.net.SocketTimeoutException' },
  ];
  const mocked = await target.fetch('https://api.x/profile');
  expect([mocked.status, await mocked.text(), mocked.headers.get('content-type')]).toEqual([503, 'down', 'text/plain']);
  await expect(target.fetch('https://api.x/timeout')).rejects.toThrow(TypeError);
  expect(calls).toEqual([]);
});

test('a network error is logged then rethrown', async () => {
  await expect(target.fetch('https://down.x')).rejects.toThrow('Network request failed');
  await until(() => sent.length === 2);
  expect(sent[1].body.responseError).toBe('Network request failed');
});

test('the fetch of React Native, built on XMLHttpRequest, is not wrapped twice', () => {
  uninstallFetchInterceptor();
  const polyfill = Object.assign(async () => new Response(''), { polyfill: true });
  const t = { fetch: polyfill };
  installFetchInterceptor(t as never);
  expect(t.fetch).toBe(polyfill);
});

test('describes requests given as a url, a URL or a Request', () => {
  expect(describeRequest(new URL('https://a.b/c'))).toEqual({ url: 'https://a.b/c', method: 'GET', headers: {} });
  expect(describeRequest(new Request('https://a.b', { method: 'PUT', headers: { X: '1' } }), { headers: [['Y', '2']] })).toEqual({
    url: 'https://a.b/',
    method: 'PUT',
    headers: { x: '1', y: '2' },
  });
});
