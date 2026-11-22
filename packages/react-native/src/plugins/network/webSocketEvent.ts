export type FloconWebSocketEventType = 'closed' | 'closing' | 'error' | 'receiveMessage' | 'sendMessage' | 'open';

/** An event of a WebSocket connection, shown with the network calls in the desktop app. */
export interface FloconWebSocketEvent {
  readonly websocketUrl: string;
  readonly event: FloconWebSocketEventType;
  /** The size of the message in bytes, computed from `message` when omitted. */
  readonly size?: number;
  readonly message?: string;
  readonly error?: unknown;
  /** Now when omitted. */
  readonly timestamp?: Date;
}

export function utf8Length(text: string): number {
  let size = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) size += 1;
    else if (code < 0x800) size += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      size += 4;
      i++;
    } else size += 3;
  }
  return size;
}
