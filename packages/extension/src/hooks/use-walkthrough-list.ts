import { useCallback, useEffect, useState } from 'react';
import { portClient } from '../lib/port-client';
import type { ApiError, WalkthroughListResult } from '../shared/messages';

export type WalkthroughListState =
  | { status: 'loading' }
  | { status: 'ready'; data: WalkthroughListResult }
  | { status: 'error'; error: ApiError };

/**
 * Loads the active tab's saved walkthroughs from the backend via the worker.
 * Side effects live here so the Preview view stays presentational.
 */
export function useWalkthroughList(): { state: WalkthroughListState; reload: () => void } {
  const [state, setState] = useState<WalkthroughListState>({ status: 'loading' });

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    portClient
      .request('walkthrough.list')
      .then((data) => setState({ status: 'ready', data }))
      .catch((err) => setState({ status: 'error', error: err as ApiError }));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { state, reload };
}
