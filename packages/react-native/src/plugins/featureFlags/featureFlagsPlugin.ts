import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';

/** Whether a flag is on, off, or on a custom variant (an experiment arm, a value...). */
export type FloconFeatureFlagState = 'on' | 'off' | 'custom';

/** A feature flag as evaluated by the app, shown in the Feature Flags section of the Flocon desktop app. */
export interface FloconFeatureFlag {
  /** Key of the flag, for example `'new_checkout'`. */
  readonly name: string;
  /** The desktop colors the variant with it. */
  readonly state: FloconFeatureFlagState;
  /** Evaluated variant, for example `'control'`, `'treatment'` or `'on'`. */
  readonly variant: string;
  /** Optional payload attached to the variant, often json. */
  readonly payload?: string;
}

/** Sends the feature flags of the app to the Flocon desktop app. */
export class FloconFeatureFlagsPlugin implements FloconPlugin {
  static readonly pluginName = 'feature_flags';
  readonly pluginName = FloconFeatureFlagsPlugin.pluginName;
  private readonly registered = new Map<string, FloconFeatureFlag[]>();

  constructor(private readonly sender: FloconMessageSender) {}

  /** Replaces the flags of a provider in the desktop app. */
  register(provider: string, flags: readonly FloconFeatureFlag[]): void {
    this.registered.set(provider, [...flags]);
    this.sendFlags(provider, flags);
  }

  onConnectedToServer(): void {
    for (const provider of [...this.registered.keys()].sort()) this.sendFlags(provider, this.registered.get(provider)!);
  }

  /** The desktop app is read only: it sends nothing to this plugin. */
  onMessageReceived(): void {}

  private sendFlags(provider: string, flags: readonly FloconFeatureFlag[]): void {
    this.sender.send({
      plugin: this.pluginName,
      method: 'register',
      body: JSON.stringify({
        provider,
        flags: flags.map((f) => ({
          name: f.name,
          state: f.state,
          variant: f.variant,
          ...(f.payload != null ? { payload: f.payload } : {}),
        })),
      }),
    });
  }
}

/**
 * Registers the feature flags of a provider (Firebase Remote Config, Statsig, an in-house one...). Each call replaces
 * the flags previously registered for the provider; they are sent again when the app reconnects to the desktop.
 */
export const FloconFeatureFlags = {
  /** Replaces the flags of `provider`, for example `'firebase'`. Does nothing before `startFlocon`. */
  register(provider: string, flags: readonly FloconFeatureFlag[]): void {
    currentClient()?.plugin(FloconFeatureFlagsPlugin)?.register(provider, flags);
  },
};
