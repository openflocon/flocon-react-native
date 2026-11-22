import { Flocon, resetFlocon } from '../flocon';
import { FloconNetwork } from '../plugins/network/floconNetwork';
import { FloconNetworkPlugin } from '../plugins/network/networkPlugin';
import { __testing, installXhrInterceptor, uninstallXhrInterceptor } from '../plugins/network/xhrInterceptor';
import { resetStarted, startFlocon } from '../start';
import { until } from './support/desktopStub';
import { nodePlatform } from './support/nodePlatform';

/** The part of React Native's XMLHttpRequest the interceptor relies on, answering like the native module. */
class FakeXHR {
  static nativeResponses: { status: number; headers: Record<string, string>; body: string; error?: string }[] = [];
  static nativeSends = 0;
  _method?: string;
  _url?: string;
  _headers: Record<string, string> = {};
  _requestId: number | null = null;
  _response: unknown = '';
  _sent = false;
  _aborted = false;
  _hasError = false;
  _timedOut = false;
  responseType = '';
  status = 0;
  readyState = 0;
  responseHeaders: Record<string, string> | null = null;
  events: string[] = [];
  private listeners: Record<string, (() => void)[]> = {};
  get response() {
    return this._response;
  }
  open(method: string, url: string) {
    this._method = method.toUpperCase();
    this._url = url;
  }
  setRequestHeader(k: string, v: string) {
    this._headers[k.toLowerCase()] = v;
  }
  addEventListener(type: string, l: () => void) {
    (this.listeners[type] ??= []).push(l);
  }
  private emit(type: string) {
    this.events.push(type);
    for (const l of this.listeners[type] ?? []) l();
  }
  send(_data?: unknown) {
    FakeXHR.nativeSends++;
    this._sent = true;
    const r = FakeXHR.nativeResponses.shift()!;
    const id = 1000 + FakeXHR.nativeSends;
    this._requestId = id;
    setTimeout(() => {
      if (r.error) return this.__didCompleteResponse(id, r.error, false);
      this.__didReceiveResponse(id, r.status, r.headers, this._url!);
      this.__didReceiveData(id, r.body);
      this.__didCompleteResponse(id, '', false);
    }, 1);
  }
  __didReceiveResponse(id: number, status: number, headers: Record<string, string>, _url?: string) {
    if (id !== this._requestId) return;
    this.status = status;
    this.responseHeaders = headers;
    this.readyState = 2;
  }
  __didReceiveData(id: number, response: unknown) {
    if (id !== this._requestId) return;
    this._response = response;
    this.readyState = 3;
  }
  __didCompleteResponse(id: number, error: string, timeout: boolean) {
    if (id !== this._requestId) return;
    if (error) {
      this._response = error;
      this._hasError = true;
      this._timedOut = timeout;
    }
    this._requestId = null;
    this.readyState = 4;
    this.emit(this._hasError ? (timeout ? 'timeout' : 'error') : 'load');
    this.emit('loadend');
  }
}

const originalSend = FakeXHR.prototype.send;
let platform: ReturnType<typeof nodePlatform>;
let network: FloconNetworkPlugin;
let sent: { method: string; body: any }[];

async function call(method: string, url: string, body?: string) {
  const xhr = new FakeXHR();
  xhr.open(method, url);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.send(body);
  await until(() => xhr.readyState === 4);
  return xhr;
}

beforeEach(async () => {
  FakeXHR.nativeSends = 0;
  platform = nodePlatform({ openWebSocket: () => new Promise(() => {}) });
  await startFlocon((f) => f.install(new FloconNetwork({ isImage: (r) => r.url.includes('/img') })), platform);
  installXhrInterceptor(FakeXHR as never);
  network = Flocon.plugin(FloconNetworkPlugin)!;
  sent = [];
  jest.spyOn(Flocon.messageSender!, 'send').mockImplementation((m) => {
    sent.push({ method: m.method, body: JSON.parse(m.body) });
  });
});

afterEach(async () => {
  uninstallXhrInterceptor();
  expect(FakeXHR.prototype.send).toBe(originalSend);
  await resetFlocon();
  resetStarted();
});

test('logs a real call, its request and its response', async () => {
  FakeXHR.nativeResponses.push({ status: 200, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true}' });
  const xhr = await call('post', 'https://api.x/users', '{"name":"Flo"}');
  expect(xhr.status).toBe(200);
  await until(() => sent.length === 2);
  const [request, response] = sent;
  expect(request.method).toBe('log_network_call_request');
  expect(request.body).toMatchObject({
    url: 'https://api.x/users',
    method: 'POST',
    requestHeaders: { accept: 'application/json' },
    requestBody: '{"name":"Flo"}',
    requestSize: 14,
    isMocked: false,
  });
  expect(response.body).toMatchObject({
    floconCallId: request.body.floconCallId,
    responseHttpCode: 200,
    responseContentType: 'application/json',
    responseBody: '{"ok":true}',
    responseSize: 11,
    responseHeaders: { 'content-type': 'application/json' },
    isImage: false,
  });
});

test('an image body is not sent', async () => {
  FakeXHR.nativeResponses.push({ status: 200, headers: {}, body: 'binary' });
  await call('GET', 'https://cdn/img/1.png');
  await until(() => sent.length === 2);
  expect(sent[1].body).toMatchObject({ isImage: true, responseBody: null, responseSize: 6 });
});

test('a network error is logged', async () => {
  FakeXHR.nativeResponses.push({ status: 0, headers: {}, body: '', error: 'The Internet connection appears to be offline.' });
  const xhr = await call('GET', 'https://api.x');
  expect(xhr.events).toEqual(['error', 'loadend']);
  await until(() => sent.length === 2);
  expect(sent[1].body.responseError).toBe('The Internet connection appears to be offline.');
});

test('a mock answers without calling the network', async () => {
  network.onMessageReceived({
    plugin: 'network',
    method: 'setup_mocks',
    body: JSON.stringify([
      { expectation: { urlPattern: 'https://api\\.x/.*', method: 'GET' }, response: { httpCode: 503, body: 'down', mediaType: 'text/plain' } },
    ]),
  });
  const xhr = await call('GET', 'https://api.x/profile');
  expect(FakeXHR.nativeSends).toBe(0);
  expect([xhr.status, xhr.response, xhr.responseHeaders?.['content-type'], xhr.events]).toEqual([503, 'down', 'text/plain', ['load', 'loadend']]);
  expect(sent.map((s) => s.body.isMocked)).toEqual([true, true]);
  expect(sent[1].body).toMatchObject({ responseHttpCode: 503, responseBody: 'down' });
});

test('a mocked timeout fails the call as a timeout', async () => {
  network.mocks = [
    { urlPattern: '.*', method: '*', delayMs: 0, body: '', mediaType: '', headers: {}, errorException: 'java.net.SocketTimeoutException' },
  ];
  const xhr = await call('GET', 'https://api.x');
  expect(xhr.events).toEqual(['timeout', 'loadend']);
  expect(FakeXHR.nativeSends).toBe(0);
  expect(sent[1].body.responseError).toBe('java.net.SocketTimeoutException');
});

test('shouldLog false and a stopped Flocon let the calls through untouched', async () => {
  network.options = { shouldLog: () => false };
  FakeXHR.nativeResponses.push({ status: 200, headers: {}, body: '' });
  await call('GET', 'https://api.x');
  expect(sent).toEqual([]);
  await resetFlocon();
  FakeXHR.nativeResponses.push({ status: 204, headers: {}, body: '' });
  expect((await call('GET', 'https://api.x')).status).toBe(204);
});

test('base64 and FormData descriptions', () => {
  expect(__testing.utf8ToBase64('héllo ✓')).toBe(Buffer.from('héllo ✓').toString('base64'));
  expect(
    __testing.describeBody({ getParts: () => [{ fieldName: 'a', string: '1' }, { fieldName: 'f', name: 'p.png' }] }),
  ).toBe('a=1&f=<file p.png>');
});
