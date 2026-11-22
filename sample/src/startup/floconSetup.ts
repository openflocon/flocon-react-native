import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flocon, FloconLifecycleObserver, FloconNetwork, startFlocon } from '@openflocon/react-native';
import { FloconCrashReporter } from '@openflocon/crash-reporter';
import { FloconDatabase } from '@openflocon/database';
import { FloconFiles } from '@openflocon/files';
import { FloconStorage } from '@openflocon/storage';
import { Platform } from 'react-native';

/** Starts Flocon and the plugins of the sample. */
export async function initializeFlocon(): Promise<void> {
  Flocon.isLoggingEnabled = true;
  await startFlocon((flocon) =>
    flocon
      // The Android emulator reaches the host machine through 10.0.2.2.
      // On a physical device, use Flocon.connect (or scan the QR code) with the local IP of the computer running Flocon.
      .connect({ host: Platform.OS === 'android' ? '10.0.2.2' : 'localhost' })
      // images are shown by the desktop from their url: their body is not sent
      .install(new FloconNetwork({ isImage: (request) => request.url.startsWith('https://picsum.photos') }))
      .install(new FloconFiles())
      .install(new FloconDatabase())
      .install(new FloconCrashReporter())
      .install(new FloconStorage(AsyncStorage)),
  );
  FloconLifecycleObserver.start();
}
