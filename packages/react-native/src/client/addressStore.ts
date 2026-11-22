import { FloconLogger } from '../core/logger';
import type { FloconPlatform } from '../platform/platform';

/** Where the last desktop address the SDK connected to is kept between two launches. */
export interface FloconAddressStore {
  load(): Promise<string | null>;
  save(address: string): Promise<void>;
  clear(): Promise<void>;
}

const FILE = 'last_address.txt';

/** Keeps the address in a file of the SDK storage folder. */
export function platformAddressStore(platform: FloconPlatform): FloconAddressStore {
  return {
    async load() {
      try {
        return (await platform.readStorageFile(FILE))?.trim() || null;
      } catch (e) {
        FloconLogger.logError('Cannot read the last address', e);
        return null;
      }
    },
    async save(address) {
      try {
        await platform.writeStorageFile(FILE, address);
      } catch (e) {
        FloconLogger.logError('Cannot save the last address', e);
      }
    },
    async clear() {
      try {
        await platform.deleteStorageFile(FILE);
      } catch {
        // nothing to forget
      }
    },
  };
}
