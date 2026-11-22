import { FLOCON_SDK_VERSION } from '../version';

test('the reported version is the one of the package', () => {
  expect(FLOCON_SDK_VERSION).toBe(require('../../package.json').version);
});
