import { readFileSync } from 'fs';
import { createServer, type Server } from 'https';
import type { AddressInfo } from 'net';
import { join } from 'path';
import { WebSocketServer, type WebSocket } from 'ws';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name));

/** A fake Flocon desktop: a `wss://` server with a self-signed certificate, recording the messages it receives. */
export class DesktopStub {
  readonly received: Record<string, any>[] = [];
  readonly sockets: WebSocket[] = [];
  connections = 0;

  private constructor(
    private readonly server: Server,
    private readonly wss: WebSocketServer,
  ) {}

  static async start(port = 0): Promise<DesktopStub> {
    const server = createServer({ cert: fixture('test_cert.pem'), key: fixture('test_key.pem') });
    const wss = new WebSocketServer({ server });
    const stub = new DesktopStub(server, wss);
    wss.on('connection', (socket) => {
      stub.connections++;
      stub.sockets.push(socket);
      socket.on('message', (data) => stub.received.push(JSON.parse(data.toString())));
    });
    await new Promise<void>((resolve) => server.listen(port, 'localhost', resolve));
    return stub;
  }

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  /** `plugin.method` of the messages received. */
  get names(): string[] {
    return this.received.map((m) => `${m.plugin}.${m.method}`);
  }

  async waitForMessages(count: number, timeoutMs = 5000): Promise<void> {
    await until(() => this.received.length >= count, timeoutMs, () => `Received ${this.received.length}/${count}`);
  }

  send(plugin: string, method: string, body = ''): void {
    for (const s of this.sockets) s.send(JSON.stringify({ plugin, method, body }));
  }

  /** Closes the connections of the apps, the server keeps listening. */
  dropConnections(): void {
    for (const s of this.sockets) s.terminate();
    this.sockets.length = 0;
  }

  async stop(): Promise<void> {
    this.dropConnections();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

export async function until(condition: () => boolean, timeoutMs = 5000, describe?: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Condition not met in time. ${describe?.() ?? ''}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
