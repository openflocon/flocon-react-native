import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';

/**
 * The type of a timeline event. The reserved types are `navigation`, `userAction` and `lifecycle`: the desktop shows
 * them with their own icon. Any other name is a custom type.
 */
export const TimelineType = {
  navigation: 'navigation',
  userAction: 'userAction',
  lifecycle: 'lifecycle',
} as const;

/** Severity of a tagged timeline event. */
export type TimelineLevel = 'debug' | 'info' | 'warning' | 'error';

export type TimelineParams = Readonly<Record<string, string>>;

/** Sends the timeline events to the Flocon desktop app. */
export class FloconTimelinePlugin implements FloconPlugin {
  static readonly pluginName = 'timeline';
  readonly pluginName = FloconTimelinePlugin.pluginName;

  constructor(
    private readonly sender: FloconMessageSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Nothing is kept: the events are sent when they are logged, then kept by the SDK until a desktop is reachable. */
  onConnectedToServer(): void {}
  /** The desktop app is read only: it sends nothing to this plugin. */
  onMessageReceived(): void {}

  /** The timestamp is the moment of the call, not the moment the message is sent. */
  send(o: { type: string; value: string; params?: TimelineParams; level?: TimelineLevel }): void {
    const timestamp = this.now().getTime();
    const params = o.params ?? {};
    this.sender.send({
      plugin: this.pluginName,
      method: 'log',
      body: JSON.stringify({
        type: o.type,
        value: o.value,
        ...(Object.keys(params).length > 0 ? { params } : {}),
        ...(o.level ? { level: o.level } : {}),
        timestamp,
      }),
    });
  }
}

const plugin = () => currentClient()?.plugin(FloconTimelinePlugin);

/**
 * Logs what happens in the app in the Flocon timeline: navigation, user actions, lifecycle and your own events.
 *
 * ```ts
 * Flocon.timeline.logNavigation('CheckoutScreen', { from: 'CartScreen' });
 * Flocon.timeline.logUserAction('tap_buy', { sku: 'premium_yearly' });
 * Flocon.timeline.logTagged('billing', 'Purchase failed', { level: 'error' });
 * ```
 *
 * The typed calls have no level, the tagged one always has one. Params are text only. Nothing happens before
 * `startFlocon`.
 */
export const FloconTimeline = {
  /** Logs an event of the given type, without any level. */
  log(type: string, value: string, params: TimelineParams = {}): void {
    plugin()?.send({ type, value, params });
  },
  /** Logs a custom event: `tag` is its type, for example `'billing'`, with a level (`info` by default). */
  logTagged(tag: string, value: string, o: { params?: TimelineParams; level?: TimelineLevel } = {}): void {
    plugin()?.send({ type: tag, value, params: o.params, level: o.level ?? 'info' });
  },
  logNavigation(value: string, params: TimelineParams = {}): void {
    FloconTimeline.log(TimelineType.navigation, value, params);
  },
  logUserAction(value: string, params: TimelineParams = {}): void {
    FloconTimeline.log(TimelineType.userAction, value, params);
  },
  logLifecycle(value: string, params: TimelineParams = {}): void {
    FloconTimeline.log(TimelineType.lifecycle, value, params);
  },
};
