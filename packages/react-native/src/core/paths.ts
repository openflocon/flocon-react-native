/** Helpers on POSIX paths (Android and iOS), for the plugin packages. */
export const FloconPaths = {
  isAbsolute: (path: string): boolean => path.startsWith('/'),
  /** Removes `file://`, `.`, `..` and repeated separators. */
  normalize(path: string): string {
    const raw = path.startsWith('file://') ? decodeURI(path.substring(7)) : path;
    const absolute = raw.startsWith('/');
    const parts: string[] = [];
    for (const part of raw.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') {
        if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
        else if (!absolute) parts.push('..');
      } else parts.push(part);
    }
    return (absolute ? '/' : '') + parts.join('/') || (absolute ? '/' : '.');
  },
  join: (...parts: string[]): string => FloconPaths.normalize(parts.join('/')),
  basename(path: string): string {
    const normalized = FloconPaths.normalize(path);
    return normalized.substring(normalized.lastIndexOf('/') + 1);
  },
  dirname(path: string): string {
    const normalized = FloconPaths.normalize(path);
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? (normalized.startsWith('/') ? '/' : '.') : normalized.substring(0, index);
  },
  /** Whether `path` is `base` or inside it. Both must be normalized. */
  isWithin(path: string, base: string): boolean {
    return path === base || path.startsWith(base.endsWith('/') ? base : `${base}/`);
  },
};
