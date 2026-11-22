/** A message sent by the Flocon desktop app to a plugin. */
export interface FloconMessageFromServer {
  readonly plugin: string;
  readonly method: string;
  readonly body: string;
}

export function parseMessageFromServer(json: unknown): FloconMessageFromServer {
  const value = json as Record<string, unknown>;
  if (typeof value?.plugin !== 'string' || typeof value.method !== 'string') {
    throw new Error('Missing plugin or method');
  }
  return { plugin: value.plugin, method: value.method, body: typeof value.body === 'string' ? value.body : '' };
}
