import type { FloconMessageFromServer } from '../model/messages';

export interface FloconMessage {
  readonly plugin: string;
  readonly method: string;
  /** The plugin payload, already encoded as a JSON string. */
  readonly body: string;
}

/** Sends a plugin message to the desktop app. */
export interface FloconMessageSender {
  send(message: FloconMessage): void;
}

/** Sends files to the Flocon desktop app, over its HTTP server. */
export interface FloconFileSender {
  /**
   * `remotePath` is the path of the file as the desktop knows it, to match the upload with its request `requestId`.
   * Never rejects.
   */
  sendFile(filePath: string, o: { remotePath: string; requestId: string }): Promise<void>;
}

/** A feature of the SDK (network, ...) that exchanges messages with the desktop app. */
export interface FloconPlugin {
  readonly pluginName: string;
  onConnectedToServer(): void;
  onMessageReceived(message: FloconMessageFromServer): void;
}
