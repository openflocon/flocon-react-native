import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ScreenProps } from '../navigation';
import { mainScreens, otherScreens, SampleScreens } from '../theme/sampleScreens';
import { SampleTheme } from '../theme/sampleTheme';
import { ConnectionChip } from '../widgets/ConnectionChip';
import { SampleCategoryIcon, SampleSection, styles } from '../widgets/SampleWidgets';

/** Lists the plugins: the four main ones as tiles, the others as rows. */
export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.row}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 1.2, color: SampleTheme.inkMuted }}>
            FLOCON SAMPLE
          </Text>
          <ConnectionChip onPress={() => navigation.navigate('Connection')} />
        </View>
        <Text style={{ marginTop: 12, fontSize: 34, fontWeight: '800', lineHeight: 38, color: SampleTheme.ink }}>
          {'Try every plugin,\none screen each'}
        </Text>
        <Text style={{ marginTop: 8, color: SampleTheme.inkMuted }}>Trigger an action here, find it in Flocon Desktop.</Text>
        <View style={{ marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {mainScreens.map((route) => {
            const s = SampleScreens[route];
            return (
              <Pressable
                key={route}
                accessibilityRole="button"
                onPress={() => navigation.navigate(route)}
                style={{
                  width: '47%',
                  flexGrow: 1,
                  height: 152,
                  padding: 16,
                  borderRadius: 16,
                  backgroundColor: SampleTheme.surface,
                  borderWidth: 1,
                  borderColor: SampleTheme.line,
                }}
              >
                <SampleCategoryIcon icon={s.icon} category={s.category} size={44} />
                <View style={{ flex: 1 }} />
                <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '700', color: SampleTheme.ink }}>
                  {s.title}
                </Text>
                <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 12, color: SampleTheme.inkMuted }}>
                  {s.subtitle}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ marginTop: 24 }}>
          <SampleSection title="More plugins">
            {otherScreens.map((route) => {
              const s = SampleScreens[route];
              return (
                <Pressable
                  key={route}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate(route)}
                  style={[styles.row, { paddingHorizontal: 16, paddingVertical: 14, gap: 14 }]}
                >
                  <SampleCategoryIcon icon={s.icon} category={s.category} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{s.title}</Text>
                    <Text style={{ fontSize: 13, color: SampleTheme.inkMuted }}>{s.subtitle}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={SampleTheme.inkFaint} />
                </Pressable>
              );
            })}
          </SampleSection>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
