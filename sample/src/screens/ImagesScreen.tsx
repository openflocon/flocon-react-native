import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';

import { api } from '../startup/clients';
import { SampleTheme } from '../theme/sampleTheme';
import { SampleBlock, SampleButton, SampleScreenContainer, SampleSection, SampleSegmented } from '../widgets/SampleWidgets';

const URLS = [
  'https://picsum.photos/id/10/400/300',
  'https://picsum.photos/id/20/400/300',
  'https://picsum.photos/id/30/400/300',
  'https://picsum.photos/id/40/400/300',
  'https://httpbin.org/image/png',
  'https://httpbin.org/image/jpeg',
];

const toDataUri = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Cannot read the image'));
    reader.readAsDataURL(blob);
  });

/**
 * Downloads images through fetch or axios and displays them. Image responses are flagged `isImage` in Flocon: the
 * desktop shows them as pictures instead of a body. `<Image source={{ uri }}>` alone loads natively, outside of Flocon.
 */
export function ImagesScreen() {
  const [client, setClient] = useState<'fetch' | 'axios'>('fetch');
  const [state, setState] = useState<{ type: 'idle' } | { type: 'loading' } | { type: 'done'; uris: string[] } | { type: 'error'; message: string }>({
    type: 'idle',
  });

  const load = async () => {
    setState({ type: 'loading' });
    try {
      const uris = await Promise.all(
        URLS.map(async (url) => {
          const blob = client === 'fetch' ? await (await fetch(url)).blob() : (await api.get<Blob>(url, { responseType: 'blob' })).data;
          return toDataUri(blob);
        }),
      );
      setState({ type: 'done', uris });
    } catch (e) {
      setState({ type: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <SampleScreenContainer screen="Images">
      <SampleSection title="Load">
        <SampleBlock>
          <SampleSegmented values={['fetch', 'axios'] as const} selected={client} onChange={setClient} />
          <SampleButton label="Load 6 images" onPress={() => void load()} />
        </SampleBlock>
      </SampleSection>
      {state.type === 'loading' ? <ActivityIndicator color={SampleTheme.accent} /> : null}
      {state.type === 'error' ? <Text style={{ color: SampleTheme.error }}>{state.message}</Text> : null}
      {state.type === 'done' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {state.uris.map((uri, i) => (
            <Image key={i} source={{ uri }} style={{ width: '48%', aspectRatio: 4 / 3, borderRadius: 12 }} />
          ))}
        </View>
      ) : null}
    </SampleScreenContainer>
  );
}
