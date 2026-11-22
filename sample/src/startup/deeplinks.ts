import { getStateFromPath, type LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from '../navigation';

/**
 * Opens the deeplinks of the sample (`flocondemo://...`), from the desktop or from the Deeplinks screen. They lead to
 * one generic destination screen, as in the Flutter sample.
 */
export function destinationOf(link: string): RootStackParamList['DeeplinkDestination'] | 'home' | null {
  const match = /^flocondemo:\/\/([^?]*)(?:\?(.*))?$/.exec(link);
  if (!match) return null;
  const segments = match[1].split('/').filter(Boolean).map(decodeURIComponent);
  const query = new URLSearchParams(match[2] ?? '');
  switch (segments[0]) {
    case 'home':
      return 'home';
    case 'user':
      return segments[1] ? { title: 'User', lines: [`Profile of ${segments[1]}`] } : null;
    case 'post':
      return segments[1] ? { title: 'Post', lines: [`Post ${segments[1]}`, `Comment: ${query.get('comment') ?? '(none)'}`] } : null;
    case 'staging':
    case 'production':
      return { title: 'Settings', lines: [`Environment: ${segments[0]}`] };
    default:
      return null;
  }
}

export const sampleLinking: LinkingOptions<RootStackParamList> = {
  prefixes: ['flocondemo://'],
  getStateFromPath(path, options) {
    const destination = destinationOf(`flocondemo://${path.replace(/^\//, '')}`);
    if (destination === 'home') return { routes: [{ name: 'Home' }] };
    if (destination) return { routes: [{ name: 'Home' }, { name: 'DeeplinkDestination', params: destination }] };
    return getStateFromPath(path, options);
  },
};
