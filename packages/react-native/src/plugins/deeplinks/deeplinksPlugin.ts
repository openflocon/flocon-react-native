import type { FloconMessageSender, FloconPlugin } from '../../core/plugin';
import { currentClient } from '../../core/registry';

/** A value suggested for a deeplink parameter or variable, with a label shown instead of it and maybe pre-selected. */
export interface FloconDeeplinkSuggestion {
  /** What is inserted in the link when the suggestion is picked. */
  readonly value: string;
  /** What the desktop shows instead of `value`. */
  readonly label?: string;
  /** Pre-selected by the desktop while the field is empty. Only the first default of a list is kept. */
  readonly isDefault?: boolean;
}

/** A plain value, or a suggestion with a label and maybe a default. */
export type FloconDeeplinkSuggestionInput = string | FloconDeeplinkSuggestion;

/** A part of a deeplink the desktop lets you fill in: written between brackets in the link, for example `[userId]`. */
export type FloconDeeplinkParameter =
  /** A parameter with suggestions. */
  | { readonly type: 'autoComplete'; readonly name: string; readonly suggestions: readonly FloconDeeplinkSuggestionInput[] }
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
  readonly suggestions?: readonly FloconDeeplinkSuggestionInput[];
}

/** Removes the duplicated values (the last declaration of a value wins) and keeps only the first default. */
export const normalizeDeeplinkSuggestions = (
  suggestions: readonly FloconDeeplinkSuggestionInput[],
): FloconDeeplinkSuggestion[] => {
  const items = suggestions.map((s): FloconDeeplinkSuggestion => (typeof s === 'string' ? { value: s } : s));
  const lastIndex = new Map<string, number>();
  items.forEach((s, i) => lastIndex.set(s.value, i));
  const unique = items.filter((s, i) => lastIndex.get(s.value) === i);
  const defaultValue = unique.find((s) => s.isDefault)?.value;
  return unique.map((s) => ({ ...s, isDefault: defaultValue !== undefined && s.value === defaultValue }));
};

const suggestionJson = (s: FloconDeeplinkSuggestion) => ({
  value: s.value,
  ...(s.label != null ? { label: s.label } : {}),
  ...(s.isDefault ? { isDefault: true } : {}),
});

/** Whether a suggestion has more than its value, so the desktop needs the detailed list. */
const hasDetails = (suggestions: readonly FloconDeeplinkSuggestionInput[]) =>
  suggestions.some((s) => typeof s !== 'string' && (s.label != null || s.isDefault));

const parameterJson = (p: FloconDeeplinkParameter) => {
  if (p.type === 'variable') return { type: 'variable', name: p.name, variableName: p.variableName };
  const items = normalizeDeeplinkSuggestions(p.suggestions);
  // `autoComplete` keeps the values for desktops that do not know `suggestions` yet
  return {
    type: 'auto_complete',
    name: p.name,
    autoComplete: items.map((s) => s.value),
    ...(hasDetails(p.suggestions) ? { suggestions: items.map(suggestionJson) } : {}),
  };
};

const variableModeJson = (suggestions: readonly FloconDeeplinkSuggestionInput[]) => {
  const items = normalizeDeeplinkSuggestions(suggestions);
  return {
    type: 'auto_complete',
    suggestions: items.map((s) => s.value),
    ...(hasDetails(suggestions) ? { items: items.map(suggestionJson) } : {}),
  };
};

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
        ...(v.suggestions != null ? { mode: variableModeJson(v.suggestions) } : {}),
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
