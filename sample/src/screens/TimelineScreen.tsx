import { Flocon, TimelineType, type TimelineLevel } from '@openflocon/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { SampleTheme } from '../theme/sampleTheme';
import {
  SampleActionRow,
  SampleBlock,
  SampleButton,
  SampleInfoCard,
  SampleScreenContainer,
  SampleSection,
  SampleSegmented,
  SampleTextField,
  styles,
} from '../widgets/SampleWidgets';

const TYPES = [TimelineType.navigation, TimelineType.userAction, TimelineType.lifecycle] as const;
const LEVELS = ['debug', 'info', 'warning', 'error'] as const;

export function TimelineScreen() {
  const [value, setValue] = useState('tap_buy');
  const [paramKey, setParamKey] = useState('sku');
  const [paramValue, setParamValue] = useState('premium_yearly');
  const [tag, setTag] = useState('billing');
  const [taggedValue, setTaggedValue] = useState('Purchase failed');
  const [type, setType] = useState<(typeof TYPES)[number]>(TimelineType.userAction);
  const [level, setLevel] = useState<TimelineLevel>('error');
  const [sent, setSent] = useState(0);
  const params = paramKey ? { [paramKey]: paramValue } : {};

  return (
    <SampleScreenContainer screen="Timeline">
      <SampleSection title="Typed logs (no level)">
        <SampleBlock>
          <SampleSegmented values={TYPES} selected={type} onChange={setType} />
          <SampleTextField value={value} onChangeText={setValue} placeholder="Value" />
          <View style={styles.row}>
            <SampleTextField style={styles.flex} value={paramKey} onChangeText={setParamKey} placeholder="Param key" />
            <SampleTextField style={styles.flex} value={paramValue} onChangeText={setParamValue} placeholder="Param value" />
          </View>
          <SampleButton
            label="Log"
            onPress={() => {
              Flocon.timeline.log(type, value, params);
              setSent((n) => n + 1);
            }}
          />
        </SampleBlock>
      </SampleSection>
      <SampleSection title="Tagged log (with a level)">
        <SampleBlock>
          <SampleTextField value={tag} onChangeText={setTag} placeholder="Tag" />
          <SampleTextField value={taggedValue} onChangeText={setTaggedValue} placeholder="Value" />
          <SampleSegmented values={LEVELS} selected={level} onChange={setLevel} />
          <SampleButton
            label="Log"
            onPress={() => {
              Flocon.timeline.logTagged(tag, taggedValue, { params, level });
              setSent((n) => n + 1);
            }}
          />
        </SampleBlock>
      </SampleSection>
      <SampleSection title="Custom type">
        <SampleActionRow
          title='Type "billing"'
          detail="A custom type, sent without a level"
          buttonTitle="Log"
          action={async () => {
            Flocon.timeline.log('billing', 'Purchase started', { sku: 'premium_yearly' });
            setSent((n) => n + 1);
          }}
        />
      </SampleSection>
      <SampleInfoCard
        tint={SampleTheme.accent}
        text={`The screen changes of the sample and the app lifecycle are logged automatically. ${sent} log(s) sent from this screen.`}
      />
    </SampleScreenContainer>
  );
}
