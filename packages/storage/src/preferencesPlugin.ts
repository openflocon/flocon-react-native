import type { FloconMessageFromServer, FloconMessageSender, FloconPlugin } from '@openflocon/react-native';

import type { FloconPreference, FloconPreferenceValue } from './preference';

/**
 * Shows the preference stores of the app in the Flocon desktop app, and applies the edits made there. The list of
 * stores is sent on each connection; the desktop then asks for the content of the displayed store and sends the
 * edited values.
 */
export class FloconPreferencesPlugin implements FloconPlugin {
  static readonly pluginName = 'shared_preferences';
  readonly pluginName = FloconPreferencesPlugin.pluginName;
  private readonly preferences = new Map<string, FloconPreference>();

  constructor(private readonly sender: FloconMessageSender) {}

  /** Adds a store (or replaces the one with the same name) and sends the updated list. */
  registerAndNotify(preference: FloconPreference): void {
    this.preferences.set(preference.name, preference);
    this.sendPreferenceList();
  }

  onConnectedToServer(): void {
    this.sendPreferenceList();
  }

  onMessageReceived(message: FloconMessageFromServer): void {
    void this.handleMessage(message);
  }

  /** Resolves when the request is answered. */
  async handleMessage(message: FloconMessageFromServer): Promise<void> {
    try {
      switch (message.method) {
        case 'get_shared_preferences':
          this.sendPreferenceList();
          break;
        case 'get_shared_preference_value': {
          const request = JSON.parse(message.body);
          const preference = this.preferences.get(request.sharedPreferenceName);
          if (preference) await this.sendContent(preference, request.requestId);
          break;
        }
        case 'set_shared_preference_value': {
          const request = JSON.parse(message.body);
          const preference = this.preferences.get(request.sharedPreferenceName);
          if (!preference) return;
          const value: FloconPreferenceValue = {
            stringValue: request.stringValue ?? undefined,
            intValue: request.intValue ?? undefined,
            longValue: request.longValue ?? undefined,
            floatValue: request.floatValue ?? undefined,
            booleanValue: request.booleanValue ?? undefined,
            setStringValue: request.setStringValue ?? undefined,
          };
          await preference.setValue(request.key, value);
          // send the content again, so that the desktop shows what was actually stored
          await this.sendContent(preference, request.requestId);
          break;
        }
        case 'remove_shared_preference_value': {
          const request = JSON.parse(message.body);
          const preference = this.preferences.get(request.sharedPreferenceName);
          if (!preference) return;
          await preference.removeValue(request.key);
          await this.sendContent(preference, request.requestId);
          break;
        }
      }
    } catch {
      // an unreadable request must never break the app
    }
  }

  sendPreferenceList(): void {
    const names = [...this.preferences.keys()].sort();
    this.sendValue(
      'get_shared_preferences',
      names.map((name) => ({ name, type: this.preferences.get(name)!.type })),
    );
  }

  private async sendContent(preference: FloconPreference, requestId: string): Promise<void> {
    const rows: object[] = [];
    for (const key of await preference.keys()) {
      const v = await preference.value(key);
      // only the property matching the type of the value is sent
      const row: Record<string, unknown> = { key };
      for (const field of ['stringValue', 'intValue', 'floatValue', 'booleanValue', 'longValue', 'setStringValue'] as const) {
        if (v?.[field] != null) row[field] = v[field];
      }
      rows.push(row);
    }
    this.sendValue('get_shared_preference_value', { requestId, sharedPreferenceName: preference.name, rows });
  }

  private sendValue(method: string, value: unknown): void {
    this.sender.send({ plugin: this.pluginName, method, body: JSON.stringify(value) });
  }
}
