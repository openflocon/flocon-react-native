import { sanitizeConfig, type FloconConfig } from '../config';
import { FloconLogger } from '../core/logger';
import type { FloconFileSender, FloconMessage, FloconMessageSender, FloconPlugin } from '../core/plugin';
import { parseMessageFromServer } from '../model/messages';
import type { FloconAppInfos, FloconPlatform, FloconSocket } from '../platform/platform';
import { FLOCON_SDK_VERSION } from '../version';
import { uploadUrl, webSocketUrl, type FloconAddress } from './address';
import { FloconOutbox, FloconOutboxLink } from './outbox';

let nextLinkId = 0;

/** One desktop the SDK connects to: the default address, or the one given to `Flocon.connect`. */
export class FloconLink {
  readonly id = nextLinkId++;
  readonly outboxLink: FloconOutboxLink;
  /** Set to stop the attempts to connect to this address. */
  cancelled = false;
  socket: FloconSocket | null = null;

  constructor(
    readonly address: FloconAddress,
    readonly isDefault: boolean,
  ) {
    this.outboxLink = new FloconOutboxLink((message) => this.socket?.send(message) ?? false);
  }

  get isConnected(): boolean {
    return this.socket !== null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type FloconPluginClass<T extends FloconPlugin> = abstract new (...args: any[]) => T;

/** Owns the connections and the plugins; sends messages to the desktop and routes incoming ones to the right plugin. */
export class FloconClient implements FloconMessageSender, FloconFileSender {
  readonly config: FloconConfig;
  readonly outbox: FloconOutbox;
  readonly defaultLink: FloconLink;
  /** The address added by `Flocon.connect`, next to the default one. */
  extraLink: FloconLink | null = null;

  private readonly appInfos: Promise<FloconAppInfos>;
  private readonly appInstance = Date.now();
  private readonly plugins = new Map<string, FloconPlugin>();
  // The link the last message of the desktop came through: the file uploads go to the same desktop.
  private incomingLink: FloconLink | null = null;
  // Serial chain keeps messages ordered while the app infos are still loading.
  private sending: Promise<void> = Promise.resolve();

  constructor(
    config: FloconConfig,
    readonly platform: FloconPlatform,
  ) {
    this.config = sanitizeConfig(config);
    this.appInfos = platform.appInfos();
    this.appInfos.catch(() => {}); // awaited where used
    this.outbox = new FloconOutbox(this.config.bufferCapacity);
    this.defaultLink = new FloconLink(
      { host: this.config.host, webSocketPort: this.config.webSocketPort, httpPort: this.config.httpPort },
      true,
    );
    this.outbox.add(this.defaultLink.outboxLink);
  }

  get isConnected(): boolean {
    return this.defaultLink.isConnected || (this.extraLink?.isConnected ?? false);
  }

  register(plugin: FloconPlugin): void {
    this.plugins.set(plugin.pluginName.toLowerCase(), plugin);
  }

  plugin<T extends FloconPlugin>(type: FloconPluginClass<T>): T | null {
    for (const p of this.plugins.values()) if (p instanceof type) return p;
    return null;
  }

  addExtraLink(address: FloconAddress): FloconLink {
    const link = new FloconLink(address, false);
    this.extraLink = link;
    this.outbox.add(link.outboxLink);
    return link;
  }

  async removeExtraLink(link: FloconLink): Promise<void> {
    link.cancelled = true;
    this.outbox.disconnected(link.outboxLink);
    this.outbox.remove(link.outboxLink);
    if (this.extraLink === link) this.extraLink = null;
    await this.disconnect(link);
  }

  /** Opens the connection, introduces the app to the desktop, then lets the outbox send what was kept. */
  async connect(link: FloconLink, onClosed: () => void): Promise<void> {
    if (link.socket) return;
    let socket: FloconSocket | null = null;
    socket = await this.platform.openWebSocket(webSocketUrl(link.address), {
      onMessage: (text) => this.onMessageReceived(link, text),
      onClosed: () => {
        // a connection that never opened, or replaced, or closed by the app
        if (socket === null || link.socket !== socket) return;
        link.socket = null;
        this.outbox.disconnected(link.outboxLink);
        onClosed();
      },
    });
    link.socket = socket;
    FloconLogger.log(`WebSocket opened on ${webSocketUrl(link.address)}`);
    const infos = await this.appInfos;
    const handshake = this.encode(infos, {
      plugin: 'bonjour',
      method: 'bonjour',
      body: JSON.stringify({ sdk: 'react-native', connectionType: link.isDefault ? 'default' : 'wifi' }),
    });
    this.outbox.connected(link.outboxLink, handshake);
    for (const p of this.plugins.values()) {
      try {
        p.onConnectedToServer();
      } catch (e) {
        FloconLogger.logError(`${p.pluginName} failed on connection`, e);
      }
    }
  }

  async disconnect(link: FloconLink): Promise<void> {
    const socket = link.socket;
    link.socket = null; // before closing, so that onClosed is not triggered
    this.outbox.disconnected(link.outboxLink);
    await socket?.close();
  }

  private onMessageReceived(link: FloconLink, text: string): void {
    let message;
    try {
      message = parseMessageFromServer(JSON.parse(text));
    } catch {
      FloconLogger.log(`Unreadable message from the desktop: ${text}`);
      return;
    }
    this.incomingLink = link;
    const plugin = message.plugin.toLowerCase();
    if (plugin === 'device') {
      if (message.method.toLowerCase() === 'get_app_icon') void this.sendAppIcon();
      return;
    }
    try {
      this.plugins.get(plugin)?.onMessageReceived(message);
    } catch (e) {
      FloconLogger.logError(`${plugin} failed on ${message.method}`, e);
    }
  }

  private async sendAppIcon(): Promise<void> {
    let icon: string | null = null;
    try {
      icon = await this.platform.appIconBase64Png();
    } catch (e) {
      FloconLogger.logError('Cannot read the app icon', e);
    }
    if (icon == null) {
      FloconLogger.log('App icon not found');
      return;
    }
    this.send({ plugin: 'device', method: 'app_icon', body: icon });
  }

  send(message: FloconMessage): void {
    this.sending = this.sending.then(async () => {
      try {
        const infos = await this.appInfos;
        this.outbox.enqueue(this.encode(infos, message));
      } catch (e) {
        FloconLogger.logError('send failed', e);
      }
    });
  }

  async sendFile(filePath: string, o: { remotePath: string; requestId: string }): Promise<void> {
    try {
      const infos = await this.appInfos;
      const address = (this.incomingLink ?? this.defaultLink).address;
      await this.platform.upload({
        url: uploadUrl(address),
        filePath,
        fileName: filePath.split('/').pop() ?? 'file',
        fields: {
          remotePath: o.remotePath,
          requestId: o.requestId,
          deviceId: infos.deviceId,
          appPackageName: infos.appPackageName,
          appInstance: `${this.appInstance}`,
        },
      });
    } catch (e) {
      FloconLogger.logError(`Upload of ${o.remotePath} failed`, e);
    }
  }

  private encode(infos: FloconAppInfos, m: FloconMessage): string {
    return JSON.stringify({
      deviceId: infos.deviceId,
      plugin: m.plugin,
      body: m.body,
      appName: infos.appName,
      appPackageName: infos.appPackageName,
      method: m.method,
      deviceName: infos.deviceName,
      appInstance: this.appInstance,
      platform: infos.platform,
      versionName: FLOCON_SDK_VERSION,
    });
  }
}
