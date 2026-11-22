import type { FloconConfig } from '../config';
import { describeError, FloconLogger } from '../core/logger';
import { describeAddress, FloconAddressError, parseAddress, sameAddress, storedAddress, type FloconAddress } from './address';
import type { FloconAddressStore } from './addressStore';
import type { FloconConnectionStateStore, FloconConnectResult } from './connectionState';
import type { FloconClient, FloconLink } from './floconClient';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Connects the client to the desktop apps: the default address is always tried, then the address given by the app
 * (or the last one that worked), each retried every `retryDelayMs` until it is reachable and again when lost.
 */
export class FloconConnections {
  private readonly client: FloconClient;
  private readonly states: FloconConnectionStateStore;
  private readonly config: FloconConfig;
  private readonly addressStore?: FloconAddressStore;
  private readonly retryDelayMs: number;
  // `connect` and `disconnect` run one after the other.
  private lock: Promise<unknown> = Promise.resolve();

  constructor(o: {
    client: FloconClient;
    states: FloconConnectionStateStore;
    config: FloconConfig;
    addressStore?: FloconAddressStore;
    retryDelayMs?: number;
  }) {
    this.client = o.client;
    this.states = o.states;
    this.config = o.config;
    this.addressStore = o.addressStore;
    this.retryDelayMs = o.retryDelayMs ?? 3000;
  }

  private locked<T>(action: () => Promise<T>): Promise<T> {
    const result = this.lock.then(action);
    this.lock = result.catch(() => {});
    return result;
  }

  async start(): Promise<void> {
    // the default address (localhost on the simulator) is always tried, whatever the other addresses
    this.launch(this.client.defaultLink);
    const stored = this.config.rememberLastAddress ? await this.addressStore?.load() : null;
    const address = stored ?? this.config.additionalAddress;
    if (!address) return;
    try {
      const parsed = this.parse(address);
      if (!sameAddress(parsed, this.client.defaultLink.address)) this.launch(this.client.addExtraLink(parsed));
    } catch (e) {
      FloconLogger.logError(`Ignoring the address '${address}'`, e);
    }
  }

  connect(address: string): Promise<FloconConnectResult> {
    return this.locked(() => this.connectLocked(address));
  }

  disconnect(): Promise<void> {
    return this.locked(async () => {
      const extra = this.client.extraLink;
      if (extra) await this.removeExtraLink(extra);
      await this.addressStore?.clear();
    });
  }

  /** Stops every connection. */
  async stop(): Promise<void> {
    await this.locked(async () => {
      const extra = this.client.extraLink;
      if (extra) await this.removeExtraLink(extra);
      this.client.defaultLink.cancelled = true;
      await this.client.disconnect(this.client.defaultLink);
      this.states.clear(this.client.defaultLink.id);
    });
  }

  private async connectLocked(address: string): Promise<FloconConnectResult> {
    let parsed: FloconAddress;
    try {
      parsed = this.parse(address);
    } catch (e) {
      if (e instanceof FloconAddressError) return { type: 'invalidAddress', reason: e.message };
      throw e;
    }
    const defaultLink = this.client.defaultLink;
    if (sameAddress(parsed, defaultLink.address)) {
      return defaultLink.isConnected
        ? { type: 'connected' }
        : { type: 'failed', reason: `${address} is the default address, Flocon is already trying to connect to it` };
    }
    const previous = this.client.extraLink;
    if (previous) await this.removeExtraLink(previous);
    const link = this.client.addExtraLink(parsed);
    try {
      await this.connectOnce(link);
      return { type: 'connected' };
    } catch (e) {
      // the messages stay kept for the other addresses, call connect again to retry
      await this.removeExtraLink(link);
      return { type: 'failed', reason: describeError(e) };
    }
  }

  private parse(address: string): FloconAddress {
    return parseAddress(address, { webSocketPort: this.config.webSocketPort, httpPort: this.config.httpPort });
  }

  private launch(link: FloconLink): void {
    this.states.set({ type: 'connecting' }, link.id);
    void this.connectUntilSuccess(link);
  }

  private async connectUntilSuccess(link: FloconLink): Promise<void> {
    while (!link.cancelled) {
      try {
        await this.connectOnce(link);
        return;
      } catch (e) {
        if (link.cancelled) return;
        this.states.set({ type: 'failed', reason: describeError(e) }, link.id);
        FloconLogger.logError(
          `Cannot connect to ${describeAddress(link.address)}, retrying in ${this.retryDelayMs / 1000}s`,
          e,
        );
        await delay(this.retryDelayMs);
      }
    }
  }

  private async connectOnce(link: FloconLink): Promise<void> {
    this.states.set({ type: 'connecting' }, link.id);
    await this.client.connect(link, () => this.connectionLost(link));
    if (link.cancelled) {
      await this.client.disconnect(link);
      throw new Error('The address was removed');
    }
    this.states.set({ type: 'connected' }, link.id);
    // the address typed by the user, or given at start, comes back at the next launch
    if (!link.isDefault && this.config.rememberLastAddress) {
      await this.addressStore?.save(
        storedAddress(link.address, { webSocketPort: this.config.webSocketPort, httpPort: this.config.httpPort }),
      );
    }
  }

  private connectionLost(link: FloconLink): void {
    if (link.cancelled) return;
    // the messages are kept until the next connection, try again to connect
    this.states.set({ type: 'buffering' }, link.id);
    this.launch(link);
  }

  private async removeExtraLink(link: FloconLink): Promise<void> {
    await this.client.removeExtraLink(link);
    this.states.clear(link.id);
  }
}
