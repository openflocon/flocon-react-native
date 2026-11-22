/** A key-value store shown in the Preferences section of the Flocon desktop app. */
export interface FloconPreference {
  /** Name of the store in the desktop app. Must be unique. */
  readonly name: string;
  /** The kind of storage, shown next to the store in the desktop app: `AsyncStorage`, `MMKV`, or any other text. */
  readonly type: string;
  keys(): Promise<string[]>;
  /** The value of a key, or null if it has no value the desktop can show. */
  value(key: string): Promise<FloconPreferenceValue | null>;
  /** Writes a value edited in the desktop. */
  setValue(key: string, value: FloconPreferenceValue): Promise<void>;
  /** Deletes a key, asked from the desktop. */
  removeValue(key: string): Promise<void>;
}

/** A preference value in one of the types the desktop can show and edit. Exactly one is set. */
export interface FloconPreferenceValue {
  readonly stringValue?: string;
  readonly intValue?: number;
  readonly longValue?: number;
  readonly floatValue?: number;
  readonly booleanValue?: boolean;
  readonly setStringValue?: string[];
}

/** The part of `@react-native-async-storage/async-storage` (or of any compatible store) Flocon uses. */
export interface AsyncStorageLike {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Shows an AsyncStorage-like store: every value is a string, edited as a string. */
export function asyncStoragePreference(storage: AsyncStorageLike, name = 'AsyncStorage', type = 'AsyncStorage'): FloconPreference {
  return {
    name,
    type,
    keys: async () => [...(await storage.getAllKeys())].sort(),
    value: async (key) => {
      const value = await storage.getItem(key);
      return value == null ? null : { stringValue: value };
    },
    setValue: async (key, value) => {
      const text =
        value.stringValue ??
        (value.booleanValue != null ? `${value.booleanValue}` : undefined) ??
        (value.longValue ?? value.intValue ?? value.floatValue)?.toString() ??
        (value.setStringValue ? JSON.stringify(value.setStringValue) : undefined);
      if (text !== undefined) await storage.setItem(key, text);
    },
    removeValue: (key) => storage.removeItem(key),
  };
}
