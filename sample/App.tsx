import { DarkTheme, NavigationContainer, useNavigationContainerRef, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { floconNavigationTracking } from '@openflocon/react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RootStackParamList } from './src/navigation';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { ConnectionScreen } from './src/screens/ConnectionScreen';
import { CrashScreen } from './src/screens/CrashScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { DatabaseScreen } from './src/screens/DatabaseScreen';
import { DeeplinkDestinationScreen, DeeplinksScreen } from './src/screens/DeeplinksScreen';
import { FeatureFlagsScreen } from './src/screens/FeatureFlagsScreen';
import { FilesScreen } from './src/screens/FilesScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { ImagesScreen } from './src/screens/ImagesScreen';
import { NetworkScreen } from './src/screens/NetworkScreen';
import { PreferencesScreen } from './src/screens/PreferencesScreen';
import { TimelineScreen } from './src/screens/TimelineScreen';
import { initializeFlocon } from './src/startup/floconSetup';
import { SampleStartup } from './src/startup/sampleState';
import { SampleScreens } from './src/theme/sampleScreens';
import { SampleTheme } from './src/theme/sampleTheme';
import { sampleLinking } from './src/startup/deeplinks';

// Debug builds only: every other Flocon call of the app does nothing when Flocon is not started.
const ready = (__DEV__ ? initializeFlocon() : Promise.resolve()).then(() => SampleStartup.run());

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: SampleTheme.bg, card: SampleTheme.bg, text: SampleTheme.ink, primary: SampleTheme.accent, border: SampleTheme.line },
};

export default function App() {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();
  useEffect(() => {
    void ready;
  }, []);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer
        ref={navigationRef}
        theme={theme}
        linking={sampleLinking as LinkingOptions<RootStackParamList>}
        // the screen changes appear in the Flocon timeline
        onReady={() => floconNavigationTracking(navigationRef)}
      >
        <Stack.Navigator screenOptions={{ headerTitleStyle: { fontSize: 17, fontWeight: '600' }, headerShadowVisible: false }}>
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Connection" component={ConnectionScreen} options={{ title: 'Remote connection' }} />
          <Stack.Screen name="Network" component={NetworkScreen} options={{ title: SampleScreens.Network.title }} />
          <Stack.Screen name="Database" component={DatabaseScreen} options={{ title: SampleScreens.Database.title }} />
          <Stack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: SampleScreens.Analytics.title }} />
          <Stack.Screen name="FeatureFlags" component={FeatureFlagsScreen} options={{ title: SampleScreens.FeatureFlags.title }} />
          <Stack.Screen name="Preferences" component={PreferencesScreen} options={{ title: SampleScreens.Preferences.title }} />
          <Stack.Screen name="Files" component={FilesScreen} options={{ title: SampleScreens.Files.title }} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: SampleScreens.Dashboard.title }} />
          <Stack.Screen name="Deeplinks" component={DeeplinksScreen} options={{ title: SampleScreens.Deeplinks.title }} />
          <Stack.Screen name="Timeline" component={TimelineScreen} options={{ title: SampleScreens.Timeline.title }} />
          <Stack.Screen name="Images" component={ImagesScreen} options={{ title: SampleScreens.Images.title }} />
          <Stack.Screen name="Crash" component={CrashScreen} options={{ title: SampleScreens.Crash.title }} />
          <Stack.Screen name="DeeplinkDestination" component={DeeplinkDestinationScreen} options={({ route }) => ({ title: route.params.title })} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
