import { FloconCrashReporterPlugin, toReport } from '../crashReporterPlugin';
import { nodePlatform } from '../../../react-native/src/__tests__/support/nodePlatform';

function setup(connected: boolean) {
  const platform = nodePlatform();
  const sent: any[][] = [];
  let isConnected = connected;
  const make = () =>
    new FloconCrashReporterPlugin({ send: (m) => sent.push(JSON.parse(m.body)) }, platform, () => isConnected);
  return { platform, sent, make, connect: () => (isConnected = true) };
}

test('an error is saved, then sent on the next connection, even after a restart, then deleted', async () => {
  const { platform, sent, make, connect } = setup(false);
  await make().recordError(new TypeError('x is undefined'));
  expect(sent).toEqual([]);
  expect(JSON.parse(platform.files.get('pending_crashes.json')!)).toHaveLength(1);
  connect();
  const relaunched = make();
  await relaunched.sendPendingCrashes();
  expect(sent).toHaveLength(1);
  expect(sent[0][0]).toMatchObject({ exceptionType: 'TypeError', exceptionMessage: 'x is undefined' });
  expect(sent[0][0].stackTrace).toContain('TypeError');
  expect(platform.files.has('pending_crashes.json')).toBe(false);
  await relaunched.sendPendingCrashes();
  expect(sent).toHaveLength(1);
});

test('sent right away when connected; anything thrown is reported', async () => {
  const { sent, make } = setup(true);
  await make().recordError('a string');
  expect(sent[0][0]).toMatchObject({ exceptionType: 'string', exceptionMessage: 'a string' });
  expect(toReport(new RangeError('r'), 5)).toMatchObject({ timestamp: 5, exceptionType: 'RangeError' });
});
