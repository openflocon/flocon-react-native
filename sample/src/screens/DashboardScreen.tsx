import { Flocon } from '@openflocon/react-native';
import { useRef } from 'react';
import { Text, View } from 'react-native';

import { useSampleUser, user } from '../startup/sampleState';
import { SampleTheme } from '../theme/sampleTheme';
import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

const NAMES = ['Florent', 'David', 'Marie', 'Sophie'];

/**
 * The dashboard "main" is started with the app and shows the user live in Flocon > Dashboard: change it here, or act on
 * it from the desktop (buttons, inputs, form) and watch it change here.
 */
export function DashboardScreen() {
  const u = useSampleUser();
  const rows = useRef(0);
  return (
    <SampleScreenContainer screen="Dashboard">
      <SampleSection title="The user of the dashboard">
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 20, fontWeight: '700', color: SampleTheme.ink }}>{u.name}</Text>
          <Text style={{ marginTop: 4, color: SampleTheme.inkMuted }}>{`${u.status}${u.isPremium ? ' · premium' : ''}`}</Text>
        </View>
        <SampleActionRow
          title="Change user"
          detail='Updates the live "User" section'
          buttonTitle="Change"
          action={async () => {
            const next = NAMES[(NAMES.indexOf(user.get().name) + 1) % NAMES.length];
            user.update({ name: next, status: 'active' });
            return next;
          }}
        />
      </SampleSection>
      <SampleSection title="Tables">
        <SampleActionRow
          title="Add table row"
          detail='Adds a row to the table "sample_users"'
          buttonTitle="Add"
          action={async () => {
            rows.current++;
            Flocon.table.table('sample_users').log({
              name: NAMES[rows.current % NAMES.length],
              age: `${20 + rows.current}`,
              created: new Date().toISOString(),
            });
            return `row ${rows.current}`;
          }}
        />
        <SampleActionRow
          title="Add a row to another table"
          detail="Columns are created from the names you use"
          buttonTitle="Add"
          action={async () => Flocon.table.table('sample_settings').log({ key: 'dark_mode', value: new Date().getSeconds() % 2 === 0 ? 'true' : 'false' })}
        />
      </SampleSection>
      <SampleInfoCard
        tint={SampleTheme.accent}
        text="In Flocon > Dashboard, click Log out, rename the user, tick Premium or submit the form: the callbacks run in this app."
      />
    </SampleScreenContainer>
  );
}
