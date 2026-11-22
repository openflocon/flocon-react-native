import { FloconLogger } from '../../core/logger';
import type { FloconPlatform } from '../../platform/platform';

/**
 * Keeps the network mocks and the bad network configuration set from the desktop on disk, so that they apply from the
 * next launch too, before the app connects to the desktop.
 */
export interface FloconNetworkStore {
  loadMocks(): Promise<string | null>;
  loadBadNetworkConfig(): Promise<string | null>;
  /** Deletes the file when `json` is null. */
  saveMocks(json: string | null): Promise<void>;
  saveBadNetworkConfig(json: string | null): Promise<void>;
}

const MOCKS = 'network_mocks.json';
const BAD_NETWORK = 'network_bad_config.json';

export function platformNetworkStore(platform: FloconPlatform): FloconNetworkStore {
  const read = async (name: string) => {
    try {
      return await platform.readStorageFile(name);
    } catch (e) {
      FloconLogger.logError('Cannot read the network configuration', e);
      return null;
    }
  };
  const write = async (name: string, json: string | null) => {
    try {
      if (json == null) await platform.deleteStorageFile(name);
      else await platform.writeStorageFile(name, json);
    } catch (e) {
      FloconLogger.logError('Cannot save the network configuration', e);
    }
  };
  return {
    loadMocks: () => read(MOCKS),
    loadBadNetworkConfig: () => read(BAD_NETWORK),
    saveMocks: (json) => write(MOCKS, json),
    saveBadNetworkConfig: (json) => write(BAD_NETWORK, json),
  };
}
