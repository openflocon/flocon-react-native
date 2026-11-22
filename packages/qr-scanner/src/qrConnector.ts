import { Flocon, type FloconConnectResult } from '@openflocon/react-native';

/**
 * Connects to the address a QR code holds, one scan at a time. The QR code of Flocon Desktop holds the IP address of
 * the computer, such as `192.168.1.20`, followed by both ports (`192.168.1.20:10023:10024`) when they are not the
 * defaults.
 */
export class FloconQrConnector {
  private busy = false;

  constructor(
    private readonly connect: (address: string) => Promise<FloconConnectResult> = (a) => Flocon.connect(a),
    /** After a failure, the same code is not tried again before this delay (the camera keeps reading it). */
    private readonly retryDelayMs = 2000,
  ) {}

  /** The result of the connection, or null if the scan was ignored (empty, or one is in progress). */
  async handle(scanned: string | null | undefined): Promise<FloconConnectResult | null> {
    const text = scanned?.trim();
    if (!text || this.busy) return null;
    this.busy = true;
    let result: FloconConnectResult;
    try {
      result = await this.connect(text);
    } catch (e) {
      result = { type: 'failed', reason: String(e) };
    }
    if (result.type === 'connected') return result; // stays busy: connected, nothing more to scan
    await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    this.busy = false;
    return result;
  }
}
