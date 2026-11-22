import { useEffect, useState } from 'react';

import type { FloconConnectionState } from './client/connectionState';
import { Flocon } from './flocon';

/** The state of the connection to the desktop, updated on each change. */
export function useFloconConnectionState(): FloconConnectionState {
  const [state, setState] = useState<FloconConnectionState>(Flocon.connectionState);
  useEffect(() => Flocon.onConnectionStateChange(setState), []);
  return state;
}
