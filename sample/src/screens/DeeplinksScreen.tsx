import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ScreenProps } from '../navigation';
import { destinationOf } from '../startup/deeplinks';
import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection, styles } from '../widgets/SampleWidgets';

/** The deeplinks are listed in Flocon > Deeplinks, with their parameters. Here they open inside the sample. */
export function DeeplinksScreen({ navigation }: ScreenProps<'Deeplinks'>) {
  const link = (url: string, detail: string) => (
    <SampleActionRow
      key={url}
      title={url}
      detail={detail}
      buttonTitle="Open"
      action={async () => {
        const destination = destinationOf(url);
        if (!destination) throw new Error('Not a deeplink of the sample');
        if (destination === 'home') navigation.popToTop();
        else navigation.navigate('DeeplinkDestination', destination);
      }}
    />
  );
  return (
    <SampleScreenContainer screen="Deeplinks">
      <SampleSection title="Open from the app">
        {link('flocondemo://home', 'Back to the home')}
        {link('flocondemo://user/Florent', 'Profile of a user')}
        {link('flocondemo://post/2?comment=Nice', 'A post with a prefilled comment')}
        {link('flocondemo://staging/settings', 'Settings of an environment')}
      </SampleSection>
      <SampleInfoCard
        text={
          'The same links are listed in Flocon > Deeplinks, with their parameters and the shared "env" variable: the sample registers the ' +
          'flocondemo scheme, so the desktop opens them in the app. From a terminal: xcrun simctl openurl booted "flocondemo://user/Florent".'
        }
      />
    </SampleScreenContainer>
  );
}

/** A destination of a deeplink. */
export function DeeplinkDestinationScreen({ route }: ScreenProps<'DeeplinkDestination'>) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <SampleSection title={route.params.title}>
          {route.params.lines.map((line) => (
            <View key={line} style={{ padding: 16 }}>
              <Text style={{ color: 'white' }}>{line}</Text>
            </View>
          ))}
        </SampleSection>
      </ScrollView>
    </SafeAreaView>
  );
}
