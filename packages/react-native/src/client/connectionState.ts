/** The state of the connection to the Flocon desktop app. */
export type FloconConnectionState =
  /** The SDK is not started. */
  | { readonly type: 'idle' }
  /** Not connected: what the app logs is kept in memory, and sent once a desktop is reachable. */
  | { readonly type: 'buffering' }
  | { readonly type: 'connecting' }
  /** Connected: the messages are sent right away. */
  | { readonly type: 'connected' }
  /** The last attempt failed. The messages are still kept, and the SDK tries again. */
  | { readonly type: 'failed'; readonly reason: string };

/** What `Flocon.connect` returns, instead of throwing. */
export type FloconConnectResult =
  | { readonly type: 'connected' }
  /** `startFlocon` has not been called, or Flocon is not available (release build, Expo Go). */
  | { readonly type: 'notStarted' }
  | { readonly type: 'invalidAddress'; readonly reason: string }
  /** The connection could not be opened. The messages are kept, call `connect` again to retry. */
  | { readonly type: 'failed'; readonly reason: string };

const IDLE: FloconConnectionState = { type: 'idle' };

/**
 * Keeps the state of every link, and publishes the one of the SDK: connected as soon as one is, else connecting,
 * else failed, else the first one.
 */
export class FloconConnectionStateStore {
  private readonly states = new Map<number, FloconConnectionState>();
  private readonly listeners = new Set<(state: FloconConnectionState) => void>();
  private current: FloconConnectionState = IDLE;

  get state(): FloconConnectionState {
    return this.current;
  }

  set(state: FloconConnectionState, link: number): void {
    this.states.set(link, state);
    this.publish();
  }

  clear(link: number): void {
    this.states.delete(link);
    this.publish();
  }

  /** Calls `listener` with the current state, then with every change. Returns the function that stops it. */
  subscribe(listener: (state: FloconConnectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private publish(): void {
    const states = [...this.states.values()];
    const next =
      states.find((s) => s.type === 'connected') ??
      states.find((s) => s.type === 'connecting') ??
      states.find((s) => s.type === 'failed') ??
      states[0] ??
      IDLE;
    const prev = this.current;
    if (next.type === prev.type && (next.type !== 'failed' || prev.type !== 'failed' || next.reason === prev.reason)) {
      return;
    }
    this.current = next;
    for (const listener of [...this.listeners]) listener(next);
  }
}
