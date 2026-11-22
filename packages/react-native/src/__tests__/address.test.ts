import { FloconAddressError, parseAddress, storedAddress, uploadUrl, webSocketUrl } from '../client/address';
import { sanitizeConfig, defaultConfig } from '../config';

const d = { webSocketPort: 9023, httpPort: 9024 };

test('a host alone takes the default ports', () => {
  expect(parseAddress('192.168.1.20', d)).toEqual({ host: '192.168.1.20', webSocketPort: 9023, httpPort: 9024 });
  expect(parseAddress(' my-mac.local ', d).host).toBe('my-mac.local');
});

test('host:ws and host:ws:http', () => {
  expect(parseAddress('192.168.1.20:10023', d)).toEqual({ host: '192.168.1.20', webSocketPort: 10023, httpPort: 9024 });
  expect(parseAddress('192.168.1.20:10023:10024', d)).toEqual({
    host: '192.168.1.20',
    webSocketPort: 10023,
    httpPort: 10024,
  });
});

test('invalid addresses throw a readable error', () => {
  for (const a of ['', '  ', 'http://192.168.1.20', '192.168.1.20/path', '192.168.1.20?x', '192.168.1.20 1', ':9023', 'a:1:2:3', 'a:1::2']) {
    expect(() => parseAddress(a, d)).toThrow(FloconAddressError);
    expect(() => parseAddress(a, d)).toThrow(/enter the IP address of the computer/);
  }
  for (const a of ['a:', 'a:0', 'a:65536', 'a:0009023', 'a:12ab', 'a:+1']) {
    expect(() => parseAddress(a, d)).toThrow(/each must be an integer from 1 to 65535/);
  }
});

test('urls and stored form', () => {
  const a = parseAddress('10.0.0.2:10023:10024', d);
  expect(webSocketUrl(a)).toBe('wss://10.0.0.2:10023');
  expect(uploadUrl(a)).toBe('https://10.0.0.2:10024/upload');
  expect(storedAddress(a, d)).toBe('10.0.0.2:10023:10024');
  expect(storedAddress(parseAddress('10.0.0.2', d), d)).toBe('10.0.0.2');
});

test('ports of the config outside 1...65535 are replaced by the defaults', () => {
  const c = sanitizeConfig({ ...defaultConfig, webSocketPort: 0, httpPort: 70000, bufferCapacity: 0 });
  expect([c.webSocketPort, c.httpPort, c.bufferCapacity]).toEqual([9023, 9024, 5000]);
});
