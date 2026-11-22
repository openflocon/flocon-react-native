import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFloconConnectionState, type FloconConnectionState } from '@openflocon/react-native';
import { Pressable, Text, View } from 'react-native';

import { SampleTheme } from '../theme/sampleTheme';

export function connectionColor(state: FloconConnectionState): string {
  switch (state.type) {
    case 'connected':
      return SampleTheme.success;
    case 'connecting':
      return SampleTheme.warning;
    case 'failed':
      return SampleTheme.error;
    default:
      return SampleTheme.inkFaint;
  }
}

export function connectionLabel(state: FloconConnectionState): string {
  switch (state.type) {
    case 'idle':
      return 'Flocon is not started';
    case 'buffering':
      return 'Not connected, messages are kept';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected to Flocon Desktop';
    case 'failed':
      return `Failed: ${state.reason}`;
  }
}

/** The button of the home, next to the title: the dot shows the state of the connection. */
export function ConnectionChip({ onPress }: { onPress: () => void }) {
  const state = useFloconConnectionState();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Connect. ${connectionLabel(state)}`}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: SampleTheme.surfaceHigh,
        borderWidth: 1,
        borderColor: SampleTheme.line,
      }}
    >
      <MaterialIcons name="wifi" size={14} color={SampleTheme.ink} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: SampleTheme.ink }}>Connect</Text>
      <View testID="connection-dot" style={{ width: 8, height: 8, borderRadius: 4, marginLeft: 2, backgroundColor: connectionColor(state) }} />
    </Pressable>
  );
}
