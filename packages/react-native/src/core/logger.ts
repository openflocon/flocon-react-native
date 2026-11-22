/** Internal debug logging of the SDK, prefixed with `[Flocon]`. Off by default. */
export const FloconLogger = {
  enabled: false,
  log(message: string): void {
    if (FloconLogger.enabled) console.log(`[Flocon] ${message}`);
  },
  logError(message: string, error: unknown): void {
    FloconLogger.log(`${message}: ${describeError(error)}`);
  },
};

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
