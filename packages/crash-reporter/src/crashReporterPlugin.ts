import {
  uuidV4,
  type FloconMessageFromServer,
  type FloconMessageSender,
  type FloconPlatform,
  type FloconPlugin,
} from '@openflocon/react-native';

/** JSON format of a crash, sent to the desktop app and saved on disk until then. */
export interface FloconCrashReport {
  readonly crashId: string;
  /** When the error happened, in milliseconds since 1970. */
  readonly timestamp: number;
  /** The name of the error, for example `TypeError`. */
  readonly exceptionType: string;
  readonly exceptionMessage: string;
  readonly stackTrace: string;
}

const PENDING_FILE = 'pending_crashes.json';

/**
 * Reports the crashes of the app to the Flocon desktop app. Every crash is first saved on disk, as the app may not
 * survive it. It is sent right away when the desktop is connected, otherwise on the next connection (even after a
 * restart), then deleted.
 */
export class FloconCrashReporterPlugin implements FloconPlugin {
  static readonly pluginName = 'crash_reporter';
  readonly pluginName = FloconCrashReporterPlugin.pluginName;
  // the reports are kept in memory too: the file may not be written before the app dies
  private pending: FloconCrashReport[] | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly sender: FloconMessageSender,
    private readonly platform: FloconPlatform,
    private readonly isConnected: () => boolean,
  ) {}

  onConnectedToServer(): void {
    void this.sendPendingCrashes();
  }

  /** The desktop sends nothing to this plugin. */
  onMessageReceived(_message: FloconMessageFromServer): void {}

  /** Saves an error, and sends it right away when connected. Never throws. */
  recordError(error: unknown): Promise<void> {
    const report = toReport(error);
    return this.serial(async () => {
      const pending = await this.load();
      pending.push(report);
      await this.save(pending);
      if (this.isConnected()) await this.sendLocked();
    });
  }

  /** Sends the saved crashes in a single message (a JSON array), then deletes them. */
  sendPendingCrashes(): Promise<void> {
    return this.serial(() => this.sendLocked());
  }

  private async sendLocked(): Promise<void> {
    const pending = await this.load();
    if (pending.length === 0) return;
    const reports = [...pending].sort((a, b) => a.timestamp - b.timestamp);
    // the client keeps the message in order and queues it while disconnected
    this.sender.send({ plugin: this.pluginName, method: 'report_crash', body: JSON.stringify(reports) });
    await this.save([]);
  }

  private serial(operation: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(operation).catch(() => {});
    return this.chain;
  }

  private async load(): Promise<FloconCrashReport[]> {
    if (this.pending) return this.pending;
    try {
      const saved = JSON.parse((await this.platform.readStorageFile(PENDING_FILE)) ?? '[]');
      this.pending = Array.isArray(saved) ? saved.filter((r) => typeof r?.crashId === 'string') : [];
    } catch {
      this.pending = [];
    }
    return this.pending;
  }

  private async save(reports: FloconCrashReport[]): Promise<void> {
    this.pending = reports;
    try {
      if (reports.length === 0) await this.platform.deleteStorageFile(PENDING_FILE);
      else await this.platform.writeStorageFile(PENDING_FILE, JSON.stringify(reports));
    } catch {
      // nothing more can be done while crashing
    }
  }
}

export function toReport(error: unknown, now = Date.now()): FloconCrashReport {
  const e = error instanceof Error ? error : null;
  return {
    crashId: uuidV4(),
    timestamp: now,
    exceptionType: e?.name ?? typeof error,
    exceptionMessage: e?.message ?? String(error),
    stackTrace: e?.stack ?? new Error(String(error)).stack ?? '',
  };
}
