import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';

import type { SampleCategoryName } from './sampleTheme';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export interface SampleScreenInfo {
  readonly route: SampleRoute;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: IconName;
  readonly category: SampleCategoryName;
}

export type SampleRoute =
  | 'Network'
  | 'Database'
  | 'Analytics'
  | 'FeatureFlags'
  | 'Preferences'
  | 'Files'
  | 'Dashboard'
  | 'Deeplinks'
  | 'Timeline'
  | 'Images'
  | 'Crash';

/** One screen per plugin of the SDK. */
export const SampleScreens: Record<SampleRoute, SampleScreenInfo> = {
  Network: { route: 'Network', title: 'Network', subtitle: 'fetch, axios, WebSocket, mocks', icon: 'swap-vert', category: 'network' },
  Database: { route: 'Database', title: 'Database', subtitle: 'SQLite queries', icon: 'storage', category: 'database' },
  Analytics: { route: 'Analytics', title: 'Analytics', subtitle: 'Events and properties', icon: 'bar-chart', category: 'analytics' },
  FeatureFlags: { route: 'FeatureFlags', title: 'Feature flags', subtitle: 'Register and observe', icon: 'outlined-flag', category: 'featureFlags' },
  Preferences: { route: 'Preferences', title: 'Preferences', subtitle: 'AsyncStorage', icon: 'table-chart', category: 'neutral' },
  Files: { route: 'Files', title: 'Files', subtitle: 'Files the desktop can browse', icon: 'folder-open', category: 'neutral' },
  Dashboard: { route: 'Dashboard', title: 'Dashboard & Tables', subtitle: 'Live values and table rows', icon: 'view-agenda', category: 'table' },
  Deeplinks: { route: 'Deeplinks', title: 'Deeplinks', subtitle: 'Links listed in the desktop', icon: 'link', category: 'deeplink' },
  Timeline: { route: 'Timeline', title: 'Timeline', subtitle: 'Navigation, actions and tagged logs', icon: 'schedule', category: 'timeline' },
  Images: { route: 'Images', title: 'Images', subtitle: 'Images loaded over HTTP', icon: 'photo', category: 'neutral' },
  Crash: { route: 'Crash', title: 'Crash reporter', subtitle: 'Throw errors on purpose', icon: 'warning-amber', category: 'crash' },
};

/** The four plugins shown as tiles on the home, the others are listed under them. */
export const mainScreens: SampleRoute[] = ['Network', 'Database', 'Analytics', 'FeatureFlags'];
export const otherScreens = (Object.keys(SampleScreens) as SampleRoute[]).filter((r) => !mainScreens.includes(r));
