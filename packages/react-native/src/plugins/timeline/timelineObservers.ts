import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

import { FloconTimeline } from './timelinePlugin';

/** The part of a React Navigation container ref (or of Expo Router's) used to follow the screens. */
export interface FloconNavigationRef {
  getCurrentRoute(): { name: string; params?: object } | undefined;
  addListener(event: 'state', listener: () => void): () => void;
}

/**
 * Logs the screen changes of a React Navigation container in the timeline:
 *
 * ```tsx
 * const navigationRef = useNavigationContainerRef();
 * useEffect(() => floconNavigationTracking(navigationRef), [navigationRef]);
 * <NavigationContainer ref={navigationRef}>...</NavigationContainer>
 * ```
 *
 * Returns the function that stops it.
 */
export function floconNavigationTracking(ref: FloconNavigationRef, timeline = FloconTimeline): () => void {
  let previous = ref.getCurrentRoute()?.name;
  if (previous) timeline.logNavigation(previous, { action: 'start' });
  return ref.addListener('state', () => {
    const current = ref.getCurrentRoute()?.name;
    if (!current || current === previous) return;
    timeline.logNavigation(current, previous ? { from: previous } : {});
    previous = current;
  });
}

let lifecycle: NativeEventSubscription | null = null;

/** Logs the lifecycle of the app (`active`, `background`, `inactive`) in the timeline. */
export const FloconLifecycleObserver = {
  /** Starts logging the lifecycle of the app. Calling it twice has no effect. */
  start(timeline = FloconTimeline): void {
    if (lifecycle) return;
    lifecycle = AppState.addEventListener('change', (state: AppStateStatus) => timeline.logLifecycle(state));
  },
  /** Stops logging the lifecycle. */
  stop(): void {
    lifecycle?.remove();
    lifecycle = null;
  },
};
