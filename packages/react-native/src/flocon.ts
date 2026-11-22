import { platformAddressStore } from './client/addressStore';
import { FloconConnectionStateStore, type FloconConnectionState, type FloconConnectResult } from './client/connectionState';
import { FloconConnections } from './client/connections';
import { FloconClient, type FloconPluginClass } from './client/floconClient';
import type { FloconConfig } from './config';
import { FloconLogger } from './core/logger';
import type { FloconFileSender, FloconMessageSender, FloconPlugin } from './core/plugin';
import { currentClient, setCurrentClient } from './core/registry';
import type { FloconPlatform } from './platform/platform';
import { FloconAnalytics } from './plugins/analytics/analyticsPlugin';
import { FloconAnalyticsPlugin } from './plugins/analytics/analyticsPlugin';
import { FloconDashboardPlugin, FloconDashboards } from './plugins/dashboard/dashboardPlugin';
import { FloconDeeplinks, FloconDeeplinksPlugin } from './plugins/deeplinks/deeplinksPlugin';
import { FloconFeatureFlags, FloconFeatureFlagsPlugin } from './plugins/featureFlags/featureFlagsPlugin';
import { FloconNetworkApi } from './plugins/network/floconNetwork';
import { FloconNetworkPlugin } from './plugins/network/networkPlugin';
import { platformNetworkStore } from './plugins/network/networkStore';
import { FloconTablePlugin, FloconTables } from './plugins/table/tablePlugin';
import { FloconTimeline, FloconTimelinePlugin } from './plugins/timeline/timelinePlugin';

let connections: FloconConnections | null = null;
const states = new FloconConnectionStateStore();

/**
 * Entry point of the Flocon SDK. Start it with `startFlocon`; before that, and in release builds, every call does
 * nothing, so they can stay in your code.
 *
 * Plugin packages add their own entry point to it when imported, for example `Flocon.files` from `@openflocon/files`.
 */
export interface FloconApi {
  /** Prints what the SDK does (connection, errors) in the console, prefixed with `[Flocon]`. Off by default. */
  isLoggingEnabled: boolean;
  readonly isInitialized: boolean;
  /** Whether a connection to a desktop app is currently open. */
  readonly isConnected: boolean;
  /** The state of the connection: connected as soon as one address is. */
  readonly connectionState: FloconConnectionState;
  /** Calls `listener` with the current state, then with every change. Returns the function that stops it. */
  onConnectionStateChange(listener: (state: FloconConnectionState) => void): () => void;
  /**
   * Also connects the app to the desktop at `address`, such as `192.168.1.20` or `192.168.1.20:10023:10024`
   * (host, WebSocket port, HTTP port), for example once the user has typed it or scanned the QR code of the desktop.
   * The default address keeps being tried. Resolves with its result instead of rejecting. The address is tried again
   * at the next launch.
   */
  connect(address: string): Promise<FloconConnectResult>;
  /** Closes the connection made with `connect`, and forgets its address. */
  disconnect(): Promise<void>;
  /** Registers a custom plugin, replacing the one with the same name. No effect before `startFlocon`. */
  register(plugin: FloconPlugin): void;
  /** The registered plugin of this class, or null. */
  plugin<T extends FloconPlugin>(type: FloconPluginClass<T>): T | null;
  /** Lets a plugin package send messages to the desktop app. Null before `startFlocon`. */
  readonly messageSender: FloconMessageSender | null;
  /** Lets a plugin package upload files to the desktop app. Null before `startFlocon`. */
  readonly fileSender: FloconFileSender | null;
  /** Lets a plugin package read and write its own files. Null before `startFlocon`. */
  readonly platform: FloconPlatform | null;
  /** The configuration in use, or null before `startFlocon`. */
  readonly config: FloconConfig | null;

  /** Logs the events of your analytics providers: `Flocon.analytics.sender('firebase').log('event')`. */
  readonly analytics: typeof FloconAnalytics;
  /** Logs rows in a table: `Flocon.table.table('users').log({ name: 'Florent' })`. */
  readonly table: typeof FloconTables;
  /** Logs the timeline events: `Flocon.timeline.logNavigation('Home')`. */
  readonly timeline: typeof FloconTimeline;
  /** Registers the feature flags of a provider: `Flocon.featureFlags.register('firebase', [...])`. */
  readonly featureFlags: typeof FloconFeatureFlags;
  /** Registers the deeplinks of the app: `Flocon.deeplinks.register([...])`. */
  readonly deeplinks: typeof FloconDeeplinks;
  /** Shows values and actions of the app: `Flocon.dashboard.dashboard('main', [...])`. */
  readonly dashboard: typeof FloconDashboards;
  /** The helpers of the Network plugin: `Flocon.network.logWebSocketEvent(event)`. */
  readonly network: typeof FloconNetworkApi;
}

// plugin packages add their own entry points (`Flocon.files`...) to the object and to `FloconApi` when imported
export const Flocon = {
  get isLoggingEnabled() {
    return FloconLogger.enabled;
  },
  set isLoggingEnabled(value: boolean) {
    FloconLogger.enabled = value;
  },
  get isInitialized() {
    return currentClient() !== null;
  },
  get isConnected() {
    return currentClient()?.isConnected ?? false;
  },
  get connectionState() {
    return states.state;
  },
  onConnectionStateChange: (listener) => states.subscribe(listener),
  connect: async (address) => (await connections?.connect(address)) ?? { type: 'notStarted' },
  disconnect: async () => {
    await connections?.disconnect();
  },
  register: (plugin) => currentClient()?.register(plugin),
  plugin: (type) => currentClient()?.plugin(type) ?? null,
  get messageSender() {
    return currentClient();
  },
  get fileSender() {
    return currentClient();
  },
  get platform() {
    return currentClient()?.platform ?? null;
  },
  get config() {
    return currentClient()?.config ?? null;
  },
  analytics: FloconAnalytics,
  table: FloconTables,
  timeline: FloconTimeline,
  featureFlags: FloconFeatureFlags,
  deeplinks: FloconDeeplinks,
  dashboard: FloconDashboards,
  network: FloconNetworkApi,
} as FloconApi;

/**
 * Starts the client: it connects in the background, retrying every 3 seconds until a desktop is reachable, and again
 * whenever the connection drops; what the app logs is kept in memory meanwhile. Called by `startFlocon`.
 * @internal
 */
export function initializeFlocon(config: FloconConfig, platform: FloconPlatform, retryDelayMs?: number): void {
  if (currentClient()) return;
  const client = new FloconClient(config, platform);
  client.register(new FloconNetworkPlugin({ sender: client, store: platformNetworkStore(platform) }));
  client.register(new FloconAnalyticsPlugin(client));
  client.register(new FloconTablePlugin(client));
  client.register(new FloconTimelinePlugin(client));
  client.register(new FloconFeatureFlagsPlugin(client));
  client.register(new FloconDeeplinksPlugin(client));
  client.register(new FloconDashboardPlugin(client));
  setCurrentClient(client);
  connections = new FloconConnections({
    client,
    states,
    config: client.config,
    addressStore: platformAddressStore(platform),
    retryDelayMs,
  });
  void connections.start();
}

/** Stops Flocon and closes its connections. For the tests. @internal */
export async function resetFlocon(): Promise<void> {
  const current = connections;
  connections = null;
  setCurrentClient(null);
  await current?.stop();
}
