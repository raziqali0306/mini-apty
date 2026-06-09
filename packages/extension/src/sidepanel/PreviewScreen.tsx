import { useState } from 'react';
import { useWalkthroughList } from '../hooks/use-walkthrough-list';
import { portClient } from '../lib/port-client';
import type { ApiError } from '../shared/messages';

function errorMessage(error: ApiError): string {
  switch (error.kind) {
    case 'network':
      return "Can't reach the server. Is the backend running?";
    case 'auth':
      return error.message || 'Please sign in again.';
    default:
      return error.message || 'Failed to load walkthroughs.';
  }
}

/** Preview mode — lists the current site's saved walkthroughs and plays them. */
export function PreviewScreen(): JSX.Element {
  const { state, reload } = useWalkthroughList();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  async function play(id: string): Promise<void> {
    setNotice(null);
    setPlayingId(id);
    try {
      await portClient.request('walkthrough.play', { id });
      setNotice({ kind: 'ok', text: 'Started — follow the balloon on the page.' });
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err as ApiError) });
    } finally {
      setPlayingId(null);
    }
  }

  if (state.status === 'loading') {
    return <p className="py-8 text-center text-sm text-slate-500">Loading walkthroughs…</p>;
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-red-700">{errorMessage(state.error)}</p>
        <button
          type="button"
          onClick={reload}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const { context, walkthroughs } = state.data;

  if (!context) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        Open a normal website tab to see its saved walkthroughs.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="truncate font-mono text-xs text-slate-500" title={context.origin}>
          {context.origin}
        </p>
        <button
          type="button"
          onClick={reload}
          className="text-xs text-slate-400 hover:text-slate-700"
        >
          Refresh
        </button>
      </div>

      {notice && (
        <div
          className={`rounded-md px-3 py-2 text-sm ${
            notice.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {notice.text}
        </div>
      )}

      {walkthroughs.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No walkthroughs saved for this site yet. Author one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {walkthroughs.map((wt) => (
            <li key={wt.id}>
              <button
                type="button"
                onClick={() => void play(wt.id)}
                disabled={playingId === wt.id}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow disabled:opacity-60"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-900">{wt.name}</span>
                    {wt.syncStatus === 'pending' && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        Sync pending
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-slate-500">{wt.pathPattern}</span>
                </span>
                <span className="shrink-0 pl-2 text-xs text-slate-400">
                  {playingId === wt.id ? 'Starting…' : `${wt.stepCount} steps`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="pt-1 text-center text-[11px] text-slate-400">
        Tap a walkthrough to play it on the current page.
      </p>
    </div>
  );
}
