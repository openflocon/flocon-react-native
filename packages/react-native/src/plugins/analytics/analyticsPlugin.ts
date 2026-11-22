import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';
import { uuidV4 } from '../../core/uuid';

/** A key-value property attached to an `AnalyticsEvent`. */
export interface AnalyticsProperty {
  readonly name: string;
  readonly value: string;
}

/** An analytics event, shown in the Analytics section of the Flocon desktop app. */
export interface AnalyticsEvent {
  readonly eventName: string;
  readonly properties?: readonly AnalyticsProperty[];
}

/** Properties as a list, or as an object of text values. */
export type AnalyticsProperties = readonly AnalyticsProperty[] | Readonly<Record<string, string>>;

const toProperties = (p: AnalyticsProperties = []): AnalyticsProperty[] =>
  Array.isArray(p) ? [...(p as AnalyticsProperty[])] : Object.entries(p).map(([name, value]) => ({ name, value }));

/** Sends analytics events to the Flocon desktop app. */
export class FloconAnalyticsPlugin implements FloconPlugin {
  static readonly pluginName = 'analytics';
  readonly pluginName = FloconAnalyticsPlugin.pluginName;

  constructor(private readonly sender: FloconMessageSender) {}

  onConnectedToServer(): void {}
  onMessageReceived(): void {}

  /** Sends the events in a single message (the desktop expects a JSON array). */
  registerAnalytics(streamName: string, events: readonly AnalyticsEvent[], createdAt: Date = new Date()): void {
    if (events.length === 0) return;
    const now = createdAt.getTime();
    this.sender.send({
      plugin: this.pluginName,
      method: 'add_items',
      body: JSON.stringify(
        events.map((e) => ({
          id: uuidV4(),
          analytics_table_id: streamName,
          event_name: e.eventName,
          created_at: now,
          properties: toProperties(e.properties).map((p) => ({ name: p.name, value: p.value })),
        })),
      ),
    });
  }
}

/** Logs the events of one stream. Does nothing before `startFlocon`. */
export class FloconAnalyticsSender {
  constructor(readonly streamName: string) {}

  log(eventName: string, properties: AnalyticsProperties = []): void {
    this.logEvents([{ eventName, properties: toProperties(properties) }]);
  }

  logEvents(events: readonly AnalyticsEvent[]): void {
    currentClient()?.plugin(FloconAnalyticsPlugin)?.registerAnalytics(this.streamName, events);
  }
}

/**
 * Logs analytics events on a stream (one table per stream in the desktop app). Use one stream per provider:
 * `Flocon.analytics.sender('firebase').log('button_clicked', { id: 'pay' })`.
 */
export const FloconAnalytics = {
  /** The logger of the stream `streamName`, for example `'firebase'`. */
  sender: (streamName: string): FloconAnalyticsSender => new FloconAnalyticsSender(streamName),
};
