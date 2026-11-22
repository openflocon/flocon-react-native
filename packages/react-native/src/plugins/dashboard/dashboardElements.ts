/** An element of a dashboard section or form. Identifiers (`id`) must be unique in their dashboard. */
export type FloconDashboardElement =
  /** A label with a value, optionally colored (`0xAARRGGBB`). */
  | { readonly kind: 'text'; readonly label: string; readonly value: string; readonly color?: number }
  /** A label alone. */
  | { readonly kind: 'label'; readonly label: string; readonly color?: number }
  /** A text shown as it is, selectable. */
  | { readonly kind: 'plainText'; readonly label: string; readonly value: string }
  /** A JSON text, shown formatted. */
  | { readonly kind: 'json'; readonly label: string; readonly value: string }
  | { readonly kind: 'markdown'; readonly label: string; readonly value: string }
  | { readonly kind: 'html'; readonly label: string; readonly value: string }
  /** A button that runs `onClick` in the app. */
  | { readonly kind: 'button'; readonly id: string; readonly text: string; readonly onClick: () => void }
  /** An input whose value is sent to `onSubmitted` when it is submitted in the desktop. */
  | {
      readonly kind: 'textField';
      readonly id: string;
      readonly label: string;
      readonly value: string;
      readonly placeholder?: string;
      readonly onSubmitted?: (value: string) => void;
    }
  /** A check box whose changes in the desktop are sent to `onChanged`. */
  | {
      readonly kind: 'checkBox';
      readonly id: string;
      readonly label: string;
      readonly value: boolean;
      readonly onChanged?: (value: boolean) => void;
    };

type Without<K extends FloconDashboardElement['kind']> = Omit<Extract<FloconDashboardElement, { kind: K }>, 'kind'>;

/** Builders of the dashboard elements, named as in the Flutter SDK. */
export const FloconText = (label: string, value: string, o: { color?: number } = {}): FloconDashboardElement => ({
  kind: 'text',
  label,
  value,
  ...o,
});
export const FloconLabel = (label: string, o: { color?: number } = {}): FloconDashboardElement => ({
  kind: 'label',
  label,
  ...o,
});
export const FloconPlainText = (label: string, value: string): FloconDashboardElement => ({ kind: 'plainText', label, value });
export const FloconJson = (label: string, value: string): FloconDashboardElement => ({ kind: 'json', label, value });
export const FloconMarkdown = (label: string, value: string): FloconDashboardElement => ({ kind: 'markdown', label, value });
export const FloconHtml = (label: string, value: string): FloconDashboardElement => ({ kind: 'html', label, value });
export const FloconButton = (text: string, o: { id: string; onClick: () => void }): FloconDashboardElement => ({
  kind: 'button',
  text,
  ...o,
});
export const FloconTextField = (o: Without<'textField'>): FloconDashboardElement => ({ kind: 'textField', ...o });
export const FloconCheckBox = (o: Without<'checkBox'>): FloconDashboardElement => ({ kind: 'checkBox', ...o });
