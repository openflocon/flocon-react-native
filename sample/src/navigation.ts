import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { SampleRoute } from './theme/sampleScreens';

export type RootStackParamList = { Home: undefined; Connection: undefined } & Record<SampleRoute, undefined> & {
    DeeplinkDestination: { title: string; lines: string[] };
  };

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
