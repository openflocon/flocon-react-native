import { Flocon, type FloconPluginFactory } from '@openflocon/react-native';

import { asyncStoragePreference, type AsyncStorageLike, type FloconPreference } from './preference';
import { FloconPreferencesPlugin } from './preferencesPlugin';

export { FloconPreferencesPlugin } from './preferencesPlugin';
export { asyncStoragePreference, type AsyncStorageLike, type FloconPreference, type FloconPreferenceValue } from './preference';

/** `Flocon.preferences`: shows the key/value stores of the app in the Preferences section of the desktop. */
export const FloconPreferencesApi = {
  /**
   * Shows an AsyncStorage-like store (`getAllKeys`, `getItem`, `setItem`, `removeItem`), whose values can be edited
   * from the desktop. Does nothing before `startFlocon`.
   */
  register(storage: AsyncStorageLike, o: { name?: string } = {}): void {
    FloconPreferencesApi.registerPreference(asyncStoragePreference(storage, o.name));
  },
  /** Shows any store, through your own `FloconPreference` (MMKV, an encrypted store...). */
  registerPreference(preference: FloconPreference): void {
    const sender = Flocon.messageSender;
    if (!sender) return;
    let plugin = Flocon.plugin(FloconPreferencesPlugin);
    if (!plugin) {
      plugin = new FloconPreferencesPlugin(sender);
      Flocon.register(plugin);
    }
    plugin.registerAndNotify(preference);
  },
};

declare module '@openflocon/react-native' {
  interface FloconApi {
    /** Shows the key/value stores of the app: `Flocon.preferences.register(AsyncStorage)`. From `@openflocon/storage`. */
    readonly preferences: typeof FloconPreferencesApi;
  }
}
Object.defineProperty(Flocon, 'preferences', { value: FloconPreferencesApi, configurable: true, enumerable: true });

/**
 * The Preferences plugin, to install with `startFlocon`: shows a store in the Flocon desktop app, where its values can
 * be edited.
 *
 * ```ts
 * import AsyncStorage from '@react-native-async-storage/async-storage';
 * await startFlocon((flocon) => flocon.install(new FloconStorage(AsyncStorage)));
 * ```
 *
 * Register other stores later with `Flocon.preferences.register`.
 */
export class FloconStorage implements FloconPluginFactory {
  constructor(
    readonly storage: AsyncStorageLike,
    readonly options: { name?: string } = {},
  ) {}

  async install(): Promise<void> {
    FloconPreferencesApi.register(this.storage, this.options);
  }
}
