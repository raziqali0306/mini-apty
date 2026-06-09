import { useState } from 'react';
import { useWalkthroughList } from '../hooks/use-walkthrough-list';
import { useAuthorStore } from '../store/use-author-store';
import { useAppStore } from '../store/use-app-store';
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

const iconProps = {
  width: 15,
  height: 15,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const PencilIcon = (): JSX.Element => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
const TrashIcon = (): JSX.Element => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const CheckIcon = (): JSX.Element => (
  <svg {...iconProps} aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const XIcon = (): JSX.Element => (
  <svg {...iconProps} aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

/** Preview mode — lists the current site's saved walkthroughs; play / edit / delete. */
export function PreviewScreen(): JSX.Element {
  const { state, reload } = useWalkthroughList();
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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

  async function edit(id: string): Promise<void> {
    setNotice(null);
    try {
      const { walkthrough } = await portClient.request('walkthrough.get', { id });
      useAuthorStore.getState().loadForEdit(walkthrough);
      useAppStore.getState().setMode('author');
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err as ApiError) });
    }
  }

  async function remove(id: string): Promise<void> {
    setNotice(null);
    setDeletingId(id);
    try {
      await portClient.request('walkthrough.delete', { id });
      setConfirmingId(null);
      reload();
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err as ApiError) });
    } finally {
      setDeletingId(null);
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
        <button type="button" onClick={reload} className="text-xs text-slate-400 hover:text-slate-700">
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
            <li
              key={wt.id}
              className="flex items-stretch rounded-lg border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => void play(wt.id)}
                disabled={playingId === wt.id}
                className="flex min-w-0 flex-1 items-center justify-between rounded-l-lg p-3 text-left transition hover:bg-slate-50 disabled:opacity-60"
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

              <div className="flex items-center gap-1 border-l border-slate-100 px-1.5">
                {confirmingId === wt.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void remove(wt.id)}
                      disabled={deletingId === wt.id}
                      aria-label="Confirm delete"
                      title="Confirm delete"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <CheckIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      aria-label="Cancel"
                      title="Cancel"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <XIcon />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void edit(wt.id)}
                      aria-label="Edit walkthrough"
                      title="Edit"
                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(wt.id)}
                      aria-label="Delete walkthrough"
                      title="Delete"
                      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon />
                    </button>
                  </>
                )}
              </div>
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
