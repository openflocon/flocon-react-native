import type { FloconDashboardElement } from './dashboardElements';

/** A block with its elements, ready to be sent. */
export interface FloconContainer {
  readonly name: string;
  readonly elements: readonly FloconDashboardElement[];
  readonly form?: { readonly submitText: string; readonly onSubmitted: (values: Record<string, string>) => void };
}

/** Calls `onChange` with each new value; returns the function that stops it. */
export type FloconSubscribe<T> = (onChange: (value: T) => void) => () => void;

/**
 * A block of a dashboard: a section or a form, with its elements. A section can follow a source of values: it is
 * rebuilt, and the dashboard sent again, each time the source emits.
 */
export interface FloconDashboardContent {
  /** Calls `emit` with the block to show, each time it changes. Returns the function that stops it. */
  containers(emit: (container: FloconContainer) => void): () => void;
}

const fixed = (container: FloconContainer): FloconDashboardContent => ({
  containers(emit) {
    emit(container);
    return () => {};
  },
});

export const FloconSection = Object.assign(
  /** A titled group of elements. */
  (name: string, elements: readonly FloconDashboardElement[] = []): FloconDashboardContent => fixed({ name, elements }),
  {
    /**
     * A section rebuilt each time `subscribe` emits a value; nothing is sent until its first value.
     * `initialValue`, when given, is used right away.
     *
     * ```ts
     * FloconSection.listen('User', (onChange) => store.subscribe((s) => onChange(s.user)), (user) => [FloconText('name', user.name)], store.getState().user)
     * ```
     */
    listen<T>(
      name: string,
      subscribe: FloconSubscribe<T>,
      builder: (value: T) => readonly FloconDashboardElement[],
      ...initialValue: [] | [T]
    ): FloconDashboardContent {
      return {
        containers(emit) {
          if (initialValue.length === 1) emit({ name, elements: builder(initialValue[0] as T) });
          return subscribe((value) => emit({ name, elements: builder(value) }));
        },
      };
    },
  },
);

/**
 * A group of inputs sent together: `onSubmitted` gets their values, keyed by their ids, with check boxes as
 * `'true'` or `'false'`.
 */
export const FloconForm = (
  name: string,
  elements: readonly FloconDashboardElement[],
  o: { submitText: string; onSubmitted: (values: Record<string, string>) => void },
): FloconDashboardContent => fixed({ name, elements, form: { submitText: o.submitText, onSubmitted: o.onSubmitted } });
