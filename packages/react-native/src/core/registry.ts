import type { FloconClient } from '../client/floconClient';

// The started client, shared by the entry points of every plugin. Null before `startFlocon`.
let current: FloconClient | null = null;

export const currentClient = (): FloconClient | null => current;

export function setCurrentClient(client: FloconClient | null): void {
  current = client;
}
