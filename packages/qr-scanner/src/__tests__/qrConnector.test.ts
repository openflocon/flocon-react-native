import { FloconQrConnector } from '../qrConnector';

test('connects once at a time, ignores empty scans, retries after a failure, stops once connected', async () => {
  const calls: string[] = [];
  const results = [{ type: 'failed', reason: 'x' } as const, { type: 'connected' } as const];
  const connector = new FloconQrConnector(async (a) => {
    calls.push(a);
    return results.shift()!;
  }, 10);
  expect(await connector.handle('  ')).toBeNull();
  const first = connector.handle(' 192.168.1.20 ');
  expect(await connector.handle('192.168.1.20')).toBeNull();
  expect(await first).toEqual({ type: 'failed', reason: 'x' });
  expect(await connector.handle('192.168.1.20:10023:10024')).toEqual({ type: 'connected' });
  expect(await connector.handle('192.168.1.21')).toBeNull();
  expect(calls).toEqual(['192.168.1.20', '192.168.1.20:10023:10024']);
});
