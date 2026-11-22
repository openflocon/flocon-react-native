import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SampleScreens, type IconName, type SampleRoute } from '../theme/sampleScreens';
import { SampleCategory, SampleTheme, soft, type SampleCategoryName } from '../theme/sampleTheme';

/** The frame shared by every plugin screen: dark background, the icon and subtitle of the plugin, then the content. */
export function SampleScreenContainer({ screen, children }: { screen: SampleRoute; children: ReactNode }) {
  const info = SampleScreens[screen];
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <SampleCategoryIcon icon={info.icon} category={info.category} size={44} />
          <Text style={[styles.muted, styles.flex]}>{info.subtitle}</Text>
        </View>
        <SamplePlatformChips />
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function SampleCategoryIcon({ icon, category, size = 36 }: { icon: IconName; category: SampleCategoryName; size?: number }) {
  const color = SampleCategory[category];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3.5, backgroundColor: soft(color), alignItems: 'center', justifyContent: 'center' }}>
      <MaterialIcons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

/** Where the feature works. */
export function SamplePlatformChips({ platforms = ['Android', 'iOS'] }: { platforms?: string[] }) {
  return (
    <View style={[styles.row, { gap: 6 }]}>
      {platforms.map((p) => (
        <View key={p} style={styles.chip}>
          <Text style={styles.chipText}>{p}</Text>
        </View>
      ))}
    </View>
  );
}

/** A titled card of rows, with a divider between them. */
export function SampleSection({ title, children }: { title: string; children: ReactNode }) {
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.card}>
        {rows.map((row, i) => (
          <View key={i} style={i > 0 ? styles.divider : undefined}>
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

export function SampleButton({
  label,
  onPress,
  isDestructive = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress?: () => void;
  isDestructive?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const background = disabled ? SampleTheme.surfaceHighest : isDestructive ? `${SampleTheme.error}D9` : SampleTheme.accent;
  const color = disabled ? SampleTheme.inkFaint : isDestructive ? SampleTheme.ink : SampleTheme.onAccent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: background, opacity: pressed ? 0.8 : 1 }]}
    >
      {icon ? <MaterialIcons name={icon} size={18} color={color} /> : null}
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

type Outcome =
  | { type: 'idle' }
  | { type: 'running' }
  | { type: 'success'; result: string | null | undefined; millis: number }
  | { type: 'failure'; message: string };

/** One feature of the SDK: a title, what it does, a button, and the result (duration or error) of the last run. */
export function SampleActionRow({
  title,
  detail,
  action,
  buttonTitle = 'Run',
  isDestructive = false,
}: {
  title: string;
  detail: string;
  action: () => Promise<string | null | undefined | void>;
  buttonTitle?: string;
  isDestructive?: boolean;
}) {
  const [outcome, setOutcome] = useState<Outcome>({ type: 'idle' });
  const run = async () => {
    setOutcome({ type: 'running' });
    const start = Date.now();
    try {
      const result = await action();
      setOutcome({ type: 'success', result: result ?? null, millis: Date.now() - start });
    } catch (e) {
      setOutcome({ type: 'failure', message: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <View style={[styles.row, styles.actionRow]}>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
        {outcome.type === 'running' ? <Note text="Running…" color={SampleTheme.inkMuted} /> : null}
        {outcome.type === 'success' ? (
          <Note text={`✓ ${[outcome.result, `${outcome.millis} ms`].filter(Boolean).join(' · ')}`} color={SampleTheme.success} />
        ) : null}
        {outcome.type === 'failure' ? <Note text={`✕ ${outcome.message}`} color={SampleTheme.error} /> : null}
      </View>
      <SampleButton label={buttonTitle} isDestructive={isDestructive} disabled={outcome.type === 'running'} onPress={() => void run()} />
    </View>
  );
}

function Note({ text, color }: { text: string; color: string }) {
  return (
    <Text style={{ marginTop: 4, fontSize: 13, color }} numberOfLines={4}>
      {text}
    </Text>
  );
}

/** A small tinted note: tips, how to trigger something from the outside. */
export function SampleInfoCard({ text, tint = SampleTheme.warning }: { text: string; tint?: string }) {
  return (
    <View style={[styles.info, { backgroundColor: `${tint}1F`, borderColor: `${tint}54` }]}>
      <Text style={{ fontSize: 13, color: SampleTheme.ink }}>{text}</Text>
    </View>
  );
}

/** A text input, in the style of the sample. */
export function SampleTextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={SampleTheme.inkFaint}
      autoCorrect={false}
      autoCapitalize="none"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

/** A choice between a few values, like the segmented buttons of the Flutter sample. */
export function SampleSegmented<T extends string>({ values, selected, onChange }: { values: readonly T[]; selected: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.segmented}>
      {values.map((v) => (
        <Pressable key={v} onPress={() => onChange(v)} style={[styles.segment, v === selected && styles.segmentSelected]}>
          <Text style={[styles.segmentText, v === selected && { color: SampleTheme.onAccent }]}>{v}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** A padded block inside a section. */
export function SampleBlock({ children }: { children: ReactNode }) {
  return <View style={{ padding: 16, gap: 10 }}>{children}</View>;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SampleTheme.bg },
  content: { padding: 20, gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  muted: { color: SampleTheme.inkMuted },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: SampleTheme.surfaceHigh, borderWidth: 1, borderColor: SampleTheme.line },
  chipText: { fontSize: 11, fontWeight: '600', color: SampleTheme.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: SampleTheme.inkFaint, marginHorizontal: 4, marginBottom: 8 },
  card: { backgroundColor: SampleTheme.surface, borderRadius: 16, borderWidth: 1, borderColor: SampleTheme.line, overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: SampleTheme.line },
  button: { minHeight: 44, minWidth: 60, paddingHorizontal: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  buttonText: { fontSize: 14, fontWeight: '600' },
  actionRow: { paddingHorizontal: 16, paddingVertical: 12 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: SampleTheme.ink },
  rowDetail: { fontSize: 13, color: SampleTheme.inkMuted, marginTop: 2 },
  info: { padding: 14, borderRadius: 12, borderWidth: 1 },
  input: {
    backgroundColor: SampleTheme.surfaceHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SampleTheme.line,
    padding: 14,
    color: SampleTheme.ink,
    fontSize: 15,
  },
  segmented: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, borderColor: SampleTheme.line, overflow: 'hidden' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentSelected: { backgroundColor: SampleTheme.accent },
  segmentText: { fontSize: 12, fontWeight: '600', color: SampleTheme.ink },
});
