import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';

/** A part of a deeplink the desktop lets you fill in: written between brackets in the link, for example `[userId]`. */
export type FloconDeeplinkParameter =
  /** A parameter with suggestions. */
  | { readonly type: 'autoComplete'; readonly name: string; readonly suggestions: readonly string[] }
  /** A parameter shared by several deeplinks, edited once in the desktop (see `FloconDeeplinkVariable`). */
  | { readonly type: 'variable'; readonly name: string; readonly variableName: string };

/** A deeplink of the app, listed in the Deeplinks section of the Flocon desktop app, which opens it. */
export interface FloconDeeplink {
  /** The link, with the parts to fill in between brackets, for example `myapp://user/[userId]`. */
  readonly link: string;
  readonly label?: string;
  readonly description?: string;
  readonly parameters?: readonly FloconDeeplinkParameter[];
}

/** A value shared by several deeplinks, edited once in the desktop app. */
export interface FloconDeeplinkVariable {
  readonly name: string;
  readonly description?: string;
  readonly suggestions?: readonly string[];
}

const parameterJson = (p: FloconDeeplinkParameter) =>
  p.type === 'autoComplete'
    ? { type: 'auto_complete', name: p.name, autoComplete: p.suggestions }
    : { type: 'variable', name: p.name, variableName: p.variableName };

/** Sends the deeplinks of the app to the Flocon desktop app. */
export class FloconDeeplinksPlugin implements FloconPlugin {
  static readonly pluginName = 'deeplink';
  readonly pluginName = FloconDeeplinksPlugin.pluginName;
  private registered: string | null = null;

  constructor(private readonly sender: FloconMessageSender) {}

  register(deeplinks: readonly FloconDeeplink[], variables: readonly FloconDeeplinkVariable[] = []): void {
    const body = JSON.stringify({
      deeplinks: deeplinks.map((d) => ({
        ...(d.label != null ? { label: d.label } : {}),
        link: d.link,
        ...(d.description != null ? { description: d.description } : {}),
        parameters: (d.parameters ?? []).map(parameterJson),
      })),
      variables: variables.map((v) => ({
        name: v.name,
        ...(v.suggestions != null ? { mode: { type: 'auto_complete', suggestions: v.suggestions } } : {}),
        ...(v.description != null ? { description: v.description } : {}),
      })),
    });
    this.registered = body;
    this.sendBody(body);
  }

  onConnectedToServer(): void {
    if (this.registered !== null) this.sendBody(this.registered);
  }

  /** The desktop app sends nothing to this plugin: it opens the deeplinks itself. */
  onMessageReceived(): void {}

  private sendBody(body: string): void {
    this.sender.send({ plugin: this.pluginName, method: 'get_deeplinks', body });
  }
}

/**
 * Lists the deeplinks of the app in the Flocon desktop app, replacing the previous list; it is sent again when the app
 * reconnects. The desktop opens them itself. Does nothing before `startFlocon`.
 */
export const FloconDeeplinks = {
  register(deeplinks: readonly FloconDeeplink[], o: { variables?: readonly FloconDeeplinkVariable[] } = {}): void {
    currentClient()?.plugin(FloconDeeplinksPlugin)?.register(deeplinks, o.variables);
  },
};
