import { Flocon, type FloconPluginFactory } from '@openflocon/react-native';

import { FloconCrashReporterPlugin } from './crashReporterPlugin';

export { FloconCrashReporterPlugin, toReport, type FloconCrashReport } from './crashReporterPlugin';

interface ErrorUtilsLike {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

/**
 * The Crash reporter plugin, to install with `startFlocon`: reports the uncaught JavaScript errors of the app to the
 * Flocon desktop app.
 *
 * It hooks the global error handler of React Native (`ErrorUtils`): the handler that was already set (the red box in
 * development, Sentry...) keeps working, it is called after the report. The crashes of the previous launch that were
 * not sent are sent as soon as the desktop is connected. Native crashes (Kotlin, Java, Swift, C++) are not reported.
 */
export class FloconCrashReporter implements FloconPluginFactory {
  /** `errorUtils`: for the tests, the global `ErrorUtils` by default. */
  constructor(readonly options: { errorUtils?: ErrorUtilsLike } = {}) {}

  async install(): Promise<void> {
    const sender = Flocon.messageSender;
    const platform = Flocon.platform;
    if (!sender || !platform || Flocon.plugin(FloconCrashReporterPlugin)) return;
    const plugin = new FloconCrashReporterPlugin(sender, platform, () => Flocon.isConnected);
    Flocon.register(plugin);
    const errorUtils = this.options.errorUtils ?? (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
    if (errorUtils) {
      const previous = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        void plugin.recordError(error);
        previous?.(error, isFatal);
      });
    }
    // crashes of a previous launch
    if (Flocon.isConnected) await plugin.sendPendingCrashes();
  }
}
