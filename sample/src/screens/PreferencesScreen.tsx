import AsyncStorage from '@react-native-async-storage/async-storage';
import { Flocon } from '@openflocon/react-native';
import '@openflocon/storage';

import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

/** AsyncStorage is listed in the Preferences section of Flocon, where its values can be edited, and any key deleted. */
export function PreferencesScreen() {
  return (
    <SampleScreenContainer screen="Preferences">
      <SampleSection title="AsyncStorage">
        <SampleActionRow
          title="Show in Flocon"
          detail="Lists the store, with a few seeded values"
          buttonTitle="Show"
          action={async () => {
            Flocon.preferences.register(AsyncStorage);
            return `${(await AsyncStorage.getAllKeys()).length} keys`;
          }}
        />
        <SampleActionRow
          title="Increment launch_count"
          detail="Then reopen the store in Flocon to refresh it"
          buttonTitle="Increment"
          action={async () => {
            const value = Number((await AsyncStorage.getItem('launch_count')) ?? '0') + 1;
            await AsyncStorage.setItem('launch_count', `${value}`);
            return `launch_count = ${value}`;
          }}
        />
        <SampleActionRow
          title="Read current values"
          detail="What the app sees after your edits in Flocon"
          buttonTitle="Read"
          action={async () => {
            const keys = [...(await AsyncStorage.getAllKeys())].sort();
            const entries = await AsyncStorage.multiGet(keys);
            return JSON.stringify(Object.fromEntries(entries));
          }}
        />
      </SampleSection>
      <SampleInfoCard text="Edit a value in Flocon > Preferences, delete a key with a right click, then read the values here." />
    </SampleScreenContainer>
  );
}
