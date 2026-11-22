import { Flocon, type FloconWebSocketEventType } from '@openflocon/react-native';
import { isAxiosError } from 'axios';

import { api, jsonPlaceholder } from '../startup/clients';
import { SampleActionRow, SampleInfoCard, SampleScreenContainer, SampleSection } from '../widgets/SampleWidgets';

/** Runs an axios call and returns its status, an error status being a result too. */
async function viaAxios(call: () => Promise<{ status: number }>): Promise<string> {
  try {
    return `${(await call()).status}`;
  } catch (e) {
    if (isAxiosError(e)) return `AxiosError (${e.code ?? 'unknown'})${e.response ? ` ${e.response.status}` : ''}`;
    throw e;
  }
}

async function viaFetch(call: () => Promise<Response>): Promise<string> {
  try {
    return `${(await call()).status}`;
  } catch (e) {
    return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }
}

const u = (path: string) => `${jsonPlaceholder}${path}`;
const shorten = (text: string) => (text.length > 80 ? `${text.substring(0, 80)}…` : text.replace(/\n/g, ' '));

/** The events of a WebSocket are logged by hand. */
function webSocketEcho(): Promise<string> {
  const url = 'wss://echo.websocket.events';
  const log = (event: FloconWebSocketEventType, o: { message?: string; error?: unknown } = {}) =>
    Flocon.network.logWebSocketEvent({ websocketUrl: url, event, ...o });
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      resolve('no echo');
    }, 8000);
    socket.onopen = () => {
      log('open');
      socket.send('hello from Flocon');
      log('sendMessage', { message: 'hello from Flocon' });
    };
    socket.onmessage = (e) => {
      log('receiveMessage', { message: String(e.data) });
      if (String(e.data) === 'hello from Flocon') {
        clearTimeout(timeout);
        log('closing');
        socket.close();
        resolve(String(e.data));
      }
    };
    socket.onerror = (e) => {
      log('error', { error: (e as unknown as { message?: string }).message ?? 'error' });
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    };
    socket.onclose = () => log('closed');
  });
}

function formData(): FormData {
  const data = new FormData();
  data.append('name', 'flocon');
  data.append('note', 'hello');
  return data;
}

export function NetworkScreen() {
  return (
    <SampleScreenContainer screen="Network">
      <SampleSection title="HTTP · fetch">
        <SampleActionRow title="GET" detail="Simple JSON request" action={() => viaFetch(() => fetch(u('/todos/1')))} />
        <SampleActionRow
          title="POST JSON"
          detail="Headers and JSON body"
          action={() =>
            viaFetch(() =>
              fetch(u('/posts'), {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ title: 'from fetch', userId: 1 }),
              }),
            )
          }
        />
        <SampleActionRow title="PUT" detail="Update a post" action={() => viaFetch(() => fetch(u('/posts/1'), { method: 'PUT', body: '{"title":"updated"}' }))} />
        <SampleActionRow title="DELETE" detail="Delete a post" action={() => viaFetch(() => fetch(u('/posts/1'), { method: 'DELETE' }))} />
        <SampleActionRow
          title="FormData upload"
          detail="Fields of a multipart body"
          action={() => viaFetch(() => fetch('https://httpbin.org/post', { method: 'POST', body: formData() }))}
        />
      </SampleSection>
      <SampleSection title="HTTP · axios">
        <SampleActionRow title="GET" detail="Simple JSON request" action={() => viaAxios(() => api.get('/posts/1'))} />
        <SampleActionRow title="GET with a query" detail="userId=1" action={() => viaAxios(() => api.get('/posts', { params: { userId: 1 } }))} />
        <SampleActionRow
          title="POST JSON"
          detail="Headers and JSON body"
          action={() => viaAxios(() => api.post('/posts', { title: 'foo', body: 'bar', userId: 1 }))}
        />
        <SampleActionRow title="PUT" detail="Update a post" action={() => viaAxios(() => api.put('/posts/1', { id: 1, title: 'updated' }))} />
        <SampleActionRow title="DELETE" detail="Delete a post" action={() => viaAxios(() => api.delete('/posts/1'))} />
        <SampleActionRow
          title="Image"
          detail="Body not sent to Flocon (isImage)"
          action={() => viaAxios(() => api.get('https://picsum.photos/id/10/400/300', { responseType: 'blob' }))}
        />
        <SampleActionRow title="Slow call" detail="3 seconds, to see the duration" action={() => viaAxios(() => api.get('https://httpbin.org/delay/3'))} />
      </SampleSection>
      <SampleSection title="Errors">
        <SampleActionRow title="404 (axios)" detail="HTTP error status" action={() => viaAxios(() => api.get('/does-not-exist'))} />
        <SampleActionRow title="500 (axios)" detail="Server error" action={() => viaAxios(() => api.get('https://httpbin.org/status/500'))} />
        <SampleActionRow
          title="Network error (axios)"
          detail="Unknown host, logged with an error"
          action={() => viaAxios(() => api.get('https://does-not-exist.invalid/'))}
        />
        <SampleActionRow title="404 (fetch)" detail="HTTP error status" action={() => viaFetch(() => fetch(u('/does-not-exist')))} />
        <SampleActionRow
          title="Network error (fetch)"
          detail="Unknown host, logged with an error"
          action={() => viaFetch(() => fetch('https://does-not-exist.invalid/'))}
        />
      </SampleSection>
      <SampleSection title="Realtime">
        <SampleActionRow title="WebSocket echo" detail="Events logged by hand" buttonTitle="Send" action={webSocketEcho} />
      </SampleSection>
      <SampleSection title="Mocks and bad network">
        <SampleActionRow
          title="GET /posts/1 (axios)"
          detail="Mock it, or turn on a bad network, from the desktop"
          action={async () => {
            try {
              const r = await api.get('/posts/1');
              return `${r.status} · ${shorten(JSON.stringify(r.data))}`;
            } catch (e) {
              if (!isAxiosError(e)) throw e;
              return `AxiosError (${e.code}) ${shorten(JSON.stringify(e.response?.data ?? e.message))}`;
            }
          }}
        />
        <SampleActionRow
          title="GET /posts/1 (fetch)"
          detail="Same call with fetch"
          action={async () => {
            try {
              const r = await fetch(u('/posts/1'));
              return `${r.status} · ${shorten(await r.text())}`;
            } catch (e) {
              return `${e instanceof Error ? e.name : 'Error'}: ${shorten(String(e))}`;
            }
          }}
        />
      </SampleSection>
      <SampleInfoCard
        text={
          'In Flocon Desktop, open Network > Mocks and create a mock for GET https://jsonplaceholder.typicode.com/posts/1, or turn on a ' +
          'Bad network configuration, then run the two calls above. Mocks are saved on the device and apply at the next launch too.'
        }
      />
    </SampleScreenContainer>
  );
}
