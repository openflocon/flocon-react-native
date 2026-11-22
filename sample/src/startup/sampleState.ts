import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Flocon,
  FloconButton,
  FloconCheckBox,
  FloconForm,
  FloconHtml,
  FloconJson,
  FloconMarkdown,
  FloconPlainText,
  FloconSection,
  FloconText,
  FloconTextField,
  type FloconDashboardHandle,
  type FloconFeatureFlag,
} from '@openflocon/react-native';
import { useSyncExternalStore } from 'react';

/** The user of the sample, shown live in the dashboard. */
export interface SampleUser {
  readonly name: string;
  readonly status: string;
  readonly isPremium: boolean;
}

/** A tiny observable store, like the ValueNotifier of the Flutter sample. */
function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l(next));
    },
    update(change: Partial<T>) {
      this.set({ ...value, ...change });
    },
    subscribe(listener: (v: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const user = createStore<SampleUser>({ name: 'Florent', status: 'active', isPremium: false });

export function useSampleUser(): SampleUser {
  return useSyncExternalStore(user.subscribe, user.get);
}

let dashboard: FloconDashboardHandle | null = null;

/** Everything the sample registers when it starts: the plugins that list things, not log them. */
export const SampleStartup = {
  async run(): Promise<void> {
    SampleStartup.registerFeatureFlags();
    SampleStartup.registerDeeplinks();
    SampleStartup.startDashboard();
    await SampleStartup.seedPreferences();
  },

  registerFeatureFlags(shuffled = false): void {
    const pick = (variants: string[]) => (shuffled ? variants[Math.floor(Math.random() * variants.length)] : variants[0]);
    const flag = (name: string, variants: string[], payload?: string): FloconFeatureFlag => {
      const variant = pick(variants);
      return {
        name,
        state: variant === 'on' ? 'on' : variant === 'off' || variant === 'control' ? 'off' : 'custom',
        variant,
        payload: variant === 'treatment' ? payload : undefined,
      };
    };
    Flocon.featureFlags.register('firebase', [
      flag('new_checkout', ['treatment', 'control'], '{"steps": 3, "color": "red"}'),
      flag('dark_mode', ['on', 'off']),
      flag('onboarding_v2', ['control', 'treatment']),
    ]);
    Flocon.featureFlags.register('statsig', [
      flag('paywall_layout', ['variant_b', 'variant_a', 'control'], '{"price": 4.99}'),
      flag('share_sheet', ['on', 'off']),
    ]);
  },

  registerDeeplinks(): void {
    Flocon.deeplinks.register(
      [
        { link: 'flocondemo://home', label: 'Home' },
        {
          link: 'flocondemo://user/[userId]',
          label: 'User',
          description: 'Open the profile of a user',
          parameters: [{ type: 'autoComplete', name: 'userId', suggestions: ['Florent', 'David', 'Marie'] }],
        },
        {
          link: 'flocondemo://post/[postId]?comment=[comment]',
          label: 'Post',
          description: 'A post with a prefilled comment',
          parameters: [
            { type: 'autoComplete', name: 'postId', suggestions: ['1', '2', '3'] },
            { type: 'autoComplete', name: 'comment', suggestions: ['Nice', 'Thanks'] },
          ],
        },
        {
          link: 'flocondemo://[env]/settings',
          label: 'Settings',
          parameters: [{ type: 'variable', name: 'env', variableName: 'env' }],
        },
      ],
      { variables: [{ name: 'env', description: 'Environment', suggestions: ['staging', 'production'] }] },
    );
  },

  startDashboard(): void {
    dashboard?.dispose();
    dashboard = Flocon.dashboard.dashboard('main', [
      FloconSection.listen<SampleUser>(
        'User',
        user.subscribe,
        (u) => [
          FloconText('name', u.name),
          FloconText('status', u.status, { color: u.status === 'active' ? 0xff4fd08a : 0xffff6d6d }),
          FloconButton('Log out', {
            id: 'logout',
            onClick: () => {
              user.update({ status: 'logged out' });
              Flocon.timeline.logUserAction('dashboard_logout');
            },
          }),
          FloconTextField({ id: 'rename', label: 'Rename', value: u.name, onSubmitted: (name) => user.update({ name }) }),
          FloconCheckBox({ id: 'premium', label: 'Premium', value: u.isPremium, onChanged: (isPremium) => user.update({ isPremium }) }),
        ],
        user.get(),
      ),
      FloconSection('Build', [
        FloconPlainText('commit', 'a1b2c3d'),
        FloconJson('config', '{"api": "https://jsonplaceholder.typicode.com", "retries": 3}'),
        FloconMarkdown('Release note', '# 1.0\nFirst **release** of the sample'),
        FloconHtml('About', '<h1>Flocon sample</h1><p>React Native</p>'),
      ]),
      FloconForm(
        'Create user',
        [FloconTextField({ id: 'name', label: 'Name', value: '' }), FloconCheckBox({ id: 'admin', label: 'Admin', value: false })],
        {
          submitText: 'Create',
          onSubmitted: (values) => {
            user.set({ name: values.name ?? '', status: 'active', isPremium: values.admin === 'true' });
            Flocon.timeline.logUserAction('dashboard_create_user', values);
          },
        },
      ),
    ]);
  },

  async seedPreferences(): Promise<void> {
    const get = (k: string) => AsyncStorage.getItem(k);
    await AsyncStorage.setItem('username', (await get('username')) ?? 'Florent');
    await AsyncStorage.setItem('dark_mode', (await get('dark_mode')) ?? 'true');
    await AsyncStorage.setItem('launch_count', `${Number((await get('launch_count')) ?? '0') + 1}`);
    await AsyncStorage.setItem('volume', (await get('volume')) ?? '0.8');
    await AsyncStorage.setItem('tags', (await get('tags')) ?? '["react-native","flocon"]');
  },
};
