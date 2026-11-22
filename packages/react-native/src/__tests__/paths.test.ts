import { FloconPaths } from '../core/paths';

test('paths', () => {
  expect(FloconPaths.normalize('file:///data/user/0/app/files/../cache//a/./b')).toBe('/data/user/0/app/cache/a/b');
  expect(FloconPaths.normalize('/../a')).toBe('/a');
  expect(FloconPaths.join('/a', 'b', '../c')).toBe('/a/c');
  expect(FloconPaths.basename('/a/b.db')).toBe('b.db');
  expect(FloconPaths.dirname('/a/b.db')).toBe('/a');
  expect(FloconPaths.dirname('/a')).toBe('/');
  expect(FloconPaths.isWithin('/a/b', '/a')).toBe(true);
  expect(FloconPaths.isWithin('/ab', '/a')).toBe(false);
  expect(FloconPaths.isWithin('/a', '/a')).toBe(true);
});
