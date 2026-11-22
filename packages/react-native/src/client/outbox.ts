import { FloconLogger } from '../core/logger';

/** A connection to a desktop, as the outbox sees it. */
export class FloconOutboxLink {
  isConnected = false;
  /** @internal */ pendingHandshake: string | null = null;
  /** @internal */ cursor = 0;

  /** `transport` sends a message, and returns false if it could not be sent. */
  constructor(readonly transport: (message: string) => boolean) {}
}

/**
 * Keeps the messages in memory until every desktop it is connected to has received them, in the order they were
 * logged. Up to `capacity` messages are kept: above it, the oldest are dropped.
 *
 * A new link receives everything still kept, after its handshake (the first message of a connection).
 */
export class FloconOutbox {
  private readonly capacity: number;
  private readonly items: string[] = [];
  private firstSequence = 0;
  private readonly links: FloconOutboxLink[] = [];

  /** How many messages were dropped because the buffer was full. */
  droppedCount = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  get bufferedCount(): number {
    return this.items.length;
  }

  add(link: FloconOutboxLink): void {
    link.cursor = this.firstSequence;
    this.links.push(link);
  }

  remove(link: FloconOutboxLink): void {
    const index = this.links.indexOf(link);
    if (index >= 0) this.links.splice(index, 1);
    this.trim();
  }

  enqueue(message: string): void {
    this.items.push(message);
    if (this.items.length > this.capacity) {
      this.items.shift();
      this.firstSequence++;
      this.droppedCount++;
      FloconLogger.log('Buffer full, the oldest message was dropped');
    }
    this.drain();
  }

  /** The link is connected: `handshake` is sent first, then the messages it did not receive. */
  connected(link: FloconOutboxLink, handshake: string): void {
    link.pendingHandshake = handshake;
    link.isConnected = true;
    this.drain();
  }

  disconnected(link: FloconOutboxLink): void {
    link.isConnected = false;
  }

  private drain(): void {
    for (const link of [...this.links]) {
      if (link.isConnected) this.drainLink(link);
    }
    this.trim();
  }

  private drainLink(link: FloconOutboxLink): void {
    while (link.isConnected) {
      // the messages it did not send may have been dropped meanwhile
      link.cursor = Math.max(link.cursor, this.firstSequence);
      const handshake = link.pendingHandshake;
      if (handshake !== null) {
        if (link.transport(handshake)) link.pendingHandshake = null;
        else link.isConnected = false;
        continue;
      }
      const index = link.cursor - this.firstSequence;
      if (index >= this.items.length) return;
      // moves on once sent, so that a failure does not lose the message
      if (link.transport(this.items[index])) link.cursor++;
      else link.isConnected = false;
    }
  }

  private trim(): void {
    if (this.links.length === 0) return;
    const sentByAll = Math.min(...this.links.map((l) => l.cursor));
    const count = Math.min(sentByAll - this.firstSequence, this.items.length);
    if (count <= 0) return;
    this.items.splice(0, count);
    this.firstSequence += count;
  }
}
