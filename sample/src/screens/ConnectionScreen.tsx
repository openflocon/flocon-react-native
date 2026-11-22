import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flocon, useFloconConnectionState, type FloconConnectResult } from '@openflocon/react-native';
import { FloconQrScannerView } from '@openflocon/qr-scanner';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SampleTheme } from '../theme/sampleTheme';
import { connectionColor, connectionLabel } from '../widgets/ConnectionChip';
import { SampleButton, SampleCategoryIcon, SampleInfoCard, SampleSection, SampleTextField, styles } from '../widgets/SampleWidgets';

const KEY = 'flocon.sample.address';

function message(result: FloconConnectResult | null): { text: string; isError: boolean } | null {
  switch (result?.type) {
    case undefined:
      return null;
    case 'connected':
      return { text: '✓ Connected', isError: false };
    case 'notStarted':
      return { text: '✕ Flocon is not started', isError: true };
    case 'invalidAddress':
    case 'failed':
      return { text: `✕ ${result.reason}`, isError: true };
  }
}

/**
 * Connects the app to Flocon Desktop at an IP address, with `Flocon.connect`, and closes it with `Flocon.disconnect`.
 * The default address keeps being tried, this one is added.
 */
export function ConnectionScreen() {
  const state = useFloconConnectionState();
  const [address, setAddress] = useState('');
  const [result, setResult] = useState<FloconConnectResult | null>(null);
  const [isConnecting, setConnecting] = useState(false);
  const [isScanning, setScanning] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(KEY).then((saved) => saved && setAddress(saved));
  }, []);

  const connect = async () => {
    const target = address.trim();
    if (!target || isConnecting) return;
    setConnecting(true);
    const r = await Flocon.connect(target);
    await AsyncStorage.setItem(KEY, target);
    setResult(r);
    setConnecting(false);
  };

  const m = message(result);
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <SampleCategoryIcon icon="wifi" category="neutral" size={44} />
          <Text style={[styles.muted, styles.flex]}>Connect to Flocon Desktop by IP</Text>
        </View>
        <SampleSection title="Status">
          <View style={[styles.row, { padding: 16 }]}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: connectionColor(state) }} />
            <Text testID="connection-state" style={[styles.rowTitle, styles.flex]}>
              {connectionLabel(state)}
            </Text>
          </View>
        </SampleSection>
        <SampleSection title="Flocon Desktop address">
          <View style={{ padding: 16, gap: 12 }}>
            <View style={styles.row}>
              <SampleTextField
                testID="address"
                style={styles.flex}
                value={address}
                onChangeText={setAddress}
                placeholder="192.168.1.20 or 192.168.1.20:10023:10024"
                keyboardType="url"
                onSubmitEditing={() => void connect()}
              />
              <SampleButton label={isConnecting ? '…' : 'Connect'} disabled={isConnecting} onPress={() => void connect()} />
            </View>
            <SampleButton label="Scan QR code" icon="qr-code-scanner" onPress={() => setScanning(true)} />
            <SampleButton
              label="Disconnect"
              disabled={isConnecting}
              onPress={() => void Flocon.disconnect().then(() => setResult(null))}
            />
            {m ? (
              <Text testID="connect-result" style={{ fontSize: 13, color: m.isError ? SampleTheme.error : SampleTheme.success }}>
                {m.text}
              </Text>
            ) : null}
          </View>
        </SampleSection>
        <SampleInfoCard
          tint={SampleTheme.accent}
          text={
            'The SDK keeps trying its default address (localhost, or 10.0.2.2 on the Android emulator) and also connects to this one. ' +
            'Add ports with host:wsPort:httpPort (192.168.1.20:10023:10024), otherwise the configured ports (9023 and 9024 by default) are used. ' +
            'The last address that worked is tried again at the next launch.'
          }
        />
      </ScrollView>
      <Modal visible={isScanning} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setScanning(false)}>
        <View style={{ flex: 1, backgroundColor: SampleTheme.bg }}>
          <FloconQrScannerView
            onResult={(r) => {
              setResult(r);
              if (r.type === 'connected') setScanning(false);
            }}
          />
          <View style={{ padding: 20 }}>
            <SampleButton label="Close" onPress={() => setScanning(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
