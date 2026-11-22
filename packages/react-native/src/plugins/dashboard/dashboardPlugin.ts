import { FloconLogger } from '../../core/logger';
import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';
import type { FloconMessageFromServer } from '../../model/messages';
import type { FloconContainer, FloconDashboardContent } from './dashboardContent';
import type { FloconDashboardElement } from './dashboardElements';

/** Stops a dashboard from following its reactive sections. The dashboard stays in the desktop, as last sent. */
export class FloconDashboardHandle {
  constructor(private stops: (() => void)[] = []) {}

  dispose(): void {
    for (const stop of this.stops) stop();
    this.stops = [];
  }
}

interface Callback {
  readonly dashboardId: string;
  onClick?: () => void;
  onTextFieldSubmitted?: (value: string) => void;
  onCheckBoxChanged?: (value: boolean) => void;
  form?: (values: Record<string, string>) => void;
}

// the color is an ARGB Int32 on the wire
const signed32 = (color: number) => color | 0;

/** A dashboard as sent to the desktop, with the callbacks of its actions. */
class Dashboard {
  readonly callbacks = new Map<string, Callback>();
  readonly json: object;

  constructor(
    readonly id: string,
    containers: readonly FloconContainer[],
  ) {
    this.json = { dashboardId: id, containers: containers.map((c) => this.container(c)) };
  }

  private actionId(elementId: string): string {
    return `${this.id}_${elementId}`;
  }

  private container(c: FloconContainer): object {
    let config: object = { containerType: 'SECTION' };
    if (c.form) {
      const formId = this.actionId(`form_${c.name}`);
      this.callbacks.set(formId, { dashboardId: this.id, form: c.form.onSubmitted });
      config = { containerType: 'FORM', formId, submitText: c.form.submitText };
    }
    return { name: c.name, elements: c.elements.map((e) => this.element(e)), containerConfig: config };
  }

  private element(e: FloconDashboardElement): object {
    const color = (value?: number) => (value != null ? { color: signed32(value) } : {});
    switch (e.kind) {
      case 'text':
        return { text: { label: e.label, value: e.value, ...color(e.color) } };
      case 'label':
        return { label: { label: e.label, ...color(e.color) } };
      case 'plainText':
        return { plainText: { label: e.label, value: e.value, type: 'text' } };
      case 'json':
        return { plainText: { label: e.label, value: e.value, type: 'json' } };
      case 'markdown':
        return { markdown: { label: e.label, value: e.value } };
      case 'html':
        return { html: { label: e.label, value: e.value } };
      case 'button': {
        const id = this.actionId(e.id);
        this.callbacks.set(id, { dashboardId: this.id, onClick: e.onClick });
        return { button: { id, text: e.text } };
      }
      case 'textField': {
        const id = this.actionId(e.id);
        this.callbacks.set(id, { dashboardId: this.id, onTextFieldSubmitted: e.onSubmitted });
        return {
          textField: {
            id,
            label: e.label,
            ...(e.placeholder != null ? { placeHolder: e.placeholder } : {}),
            value: e.value,
          },
        };
      }
      case 'checkBox': {
        const id = this.actionId(e.id);
        this.callbacks.set(id, { dashboardId: this.id, onCheckBoxChanged: e.onChanged });
        return { checkBox: { id, label: e.label, value: e.value } };
      }
    }
  }
}

/** Sends the dashboards of the app to the Flocon desktop app, and routes the actions made there. */
export class FloconDashboardPlugin implements FloconPlugin {
  static readonly pluginName = 'dashboard';
  readonly pluginName = FloconDashboardPlugin.pluginName;
  private readonly dashboards = new Map<string, Dashboard>();

  constructor(private readonly sender: FloconMessageSender) {}

  /** Starts a dashboard: it is sent once all its blocks have a value. */
  dashboard(id: string, contents: readonly FloconDashboardContent[]): FloconDashboardHandle {
    if (contents.length === 0) {
      this.register(id, []);
      return new FloconDashboardHandle();
    }
    const latest: (FloconContainer | null)[] = contents.map(() => null);
    const stops = contents.map((content, i) =>
      content.containers((container) => {
        latest[i] = container;
        if (latest.every((c) => c !== null)) this.register(id, latest as FloconContainer[]);
      }),
    );
    return new FloconDashboardHandle(stops);
  }

  private register(id: string, containers: readonly FloconContainer[]): void {
    const dashboard = new Dashboard(id, [...containers]);
    this.dashboards.set(id, dashboard);
    this.sendDashboard(dashboard);
  }

  onConnectedToServer(): void {
    for (const d of [...this.dashboards.values()]) this.sendDashboard(d);
  }

  onMessageReceived(message: FloconMessageFromServer): void {
    try {
      switch (message.method) {
        case 'on_click':
          // the body is the identifier of the button
          this.callback(unquote(message.body))?.onClick?.();
          break;
        case 'on_text_field_submitted': {
          const event = JSON.parse(message.body);
          this.callback(event.id)?.onTextFieldSubmitted?.(String(event.value));
          break;
        }
        case 'on_check_box_value_changed': {
          const event = JSON.parse(message.body);
          this.callback(event.id)?.onCheckBoxChanged?.(Boolean(event.value));
          break;
        }
        case 'on_form_submitted': {
          const event = JSON.parse(message.body);
          const callback = this.callback(event.id);
          if (!callback?.form) return;
          // gives back the identifiers of the app: "<dashboardId>_name" -> "name"
          const prefix = `${callback.dashboardId}_`;
          const values: Record<string, string> = {};
          for (const [key, value] of Object.entries(event.values ?? {})) {
            values[key.startsWith(prefix) ? key.substring(prefix.length) : key] = `${value}`;
          }
          callback.form(values);
          break;
        }
        default:
          FloconLogger.log(`Unknown dashboard method: ${message.method}`);
      }
    } catch (e) {
      FloconLogger.logError('Dashboard message error', e);
    }
  }

  private callback(actionId: string): Callback | undefined {
    for (const d of this.dashboards.values()) {
      const callback = d.callbacks.get(actionId);
      if (callback) return callback;
    }
    return undefined;
  }

  private sendDashboard(d: Dashboard): void {
    this.sender.send({ plugin: this.pluginName, method: 'update', body: JSON.stringify(d.json) });
  }
}

function unquote(body: string): string {
  const text = body.trim();
  if (text.startsWith('"')) {
    try {
      return String(JSON.parse(text));
    } catch {
      // not JSON
    }
  }
  return text;
}

/**
 * Shows values of the app in the Flocon desktop app, and runs actions in it from there. A section is either static,
 * or rebuilt each time its source emits. Keep the handle: the dashboard stops following them when you call `dispose`.
 * The dashboard is sent once every reactive section has a value, and again on each connection.
 * Does nothing before `startFlocon`.
 */
export const FloconDashboards = {
  dashboard(id: string, contents: readonly FloconDashboardContent[]): FloconDashboardHandle {
    return currentClient()?.plugin(FloconDashboardPlugin)?.dashboard(id, contents) ?? new FloconDashboardHandle();
  },
};
