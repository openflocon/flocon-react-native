import { Flocon } from '@openflocon/react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { SampleTheme } from '../theme/sampleTheme';
import { SampleActionRow, SampleBlock, SampleInfoCard, SampleScreenContainer, SampleSection, SampleTextField, styles } from '../widgets/SampleWidgets';

export function AnalyticsScreen() {
  const [stream, setStream] = useState('sample');
  const [event, setEvent] = useState('button_clicked');
  const [key, setKey] = useState('button_id');
  const [value, setValue] = useState('checkout_pay');
  return (
    <SampleScreenContainer screen="Analytics">
      <SampleSection title="Your own event">
        <SampleBlock>
          <SampleTextField value={stream} onChangeText={setStream} placeholder="Stream (one table per provider)" />
          <SampleTextField value={event} onChangeText={setEvent} placeholder="Event name" />
          <View style={styles.row}>
            <SampleTextField style={styles.flex} value={key} onChangeText={setKey} placeholder="Property" />
            <SampleTextField style={styles.flex} value={value} onChangeText={setValue} placeholder="Value" />
          </View>
        </SampleBlock>
        <SampleActionRow
          title="Send"
          detail="One event with one property"
          buttonTitle="Send"
          action={async () => {
            Flocon.analytics.sender(stream).logEvents([{ eventName: event, properties: [{ name: key, value }] }]);
            return `sent on "${stream}"`;
          }}
        />
      </SampleSection>
      <SampleSection title="Presets">
        <SampleActionRow
          title="Button tapped"
          detail='One event in the stream "sample"'
          buttonTitle="Send"
          action={async () => Flocon.analytics.sender('sample').log('button_tapped', { at: new Date().toISOString() })}
        />
        <SampleActionRow
          title="Firebase-style events"
          detail="Two events from one stream"
          buttonTitle="Send"
          action={async () =>
            Flocon.analytics.sender('firebase').logEvents([
              { eventName: 'screen_view', properties: [{ name: 'screen_name', value: 'AnalyticsScreen' }, { name: 'screen_class', value: 'ReactNative' }] },
              {
                eventName: 'add_to_cart',
                properties: [{ name: 'item_id', value: 'sku_42' }, { name: 'value', value: '9.99' }, { name: 'currency', value: 'EUR' }],
              },
            ])
          }
        />
        <SampleActionRow
          title="Amplitude purchase"
          detail="A second provider, a second table"
          buttonTitle="Send"
          action={async () => Flocon.analytics.sender('amplitude').log('purchase', { sku: 'pro_monthly', price: '9.99' })}
        />
      </SampleSection>
      <SampleInfoCard text="Each stream is its own table in Flocon > Analytics: use one stream per analytics provider." tint={SampleTheme.accent} />
    </SampleScreenContainer>
  );
}
