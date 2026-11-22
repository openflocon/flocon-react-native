import type { FloconConnectResult } from '@openflocon/react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { FloconQrConnector } from './qrConnector';

export interface FloconQrScannerViewProps {
  /** The result of each connection attempt, for example to close the screen once connected. */
  onResult?: (result: FloconConnectResult) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A camera view that connects the app to the Flocon desktop by scanning the QR code it shows. Asks for the camera
 * permission (add the `expo-camera` config plugin with its `cameraPermission` text).
 *
 * ```tsx
 * <FloconQrScannerView onResult={(r) => r.type === 'connected' && navigation.goBack()} />
 * ```
 */
export function FloconQrScannerView({ onResult, style }: FloconQrScannerViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const connector = useMemo(() => new FloconQrConnector(), []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  if (!permission?.granted) {
    return (
      <View style={[styles.container, styles.center, style]}>
        <Text style={styles.text}>Flocon needs the camera to scan the QR code of the desktop.</Text>
        <Pressable onPress={() => void requestPermission()} style={styles.button}>
          <Text style={styles.buttonText}>Allow the camera</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <CameraView
      style={[styles.container, style]}
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => {
        void connector.handle(data).then((result) => {
          if (result) onResult?.(result);
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  text: { textAlign: 'center' },
  button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#3D7EFF' },
  buttonText: { color: 'white', fontWeight: '600' },
});
