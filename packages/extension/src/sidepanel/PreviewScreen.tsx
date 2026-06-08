import { useWalkthroughList } from '../hooks/use-walkthrough-list';
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

/** Preview mode — lists the current site's saved walkthroughs from the backend. */
export function PreviewScreen(): JSX.Element {
  const { state, reload } = useWalkthroughList();

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

      {walkthroughs.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No walkthroughs saved for this site yet. Author one to get started.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {walkthroughs.map((wt) => (
            <li
              key={wt.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-slate-900">{wt.name}</span>
                <span className="truncate font-mono text-xs text-slate-500">{wt.pathPattern}</span>
              </span>
              <span className="shrink-0 pl-2 text-xs text-slate-400">{wt.stepCount} steps</span>
            </li>
          ))}
        </ul>
      )}

      <p className="pt-1 text-center text-[11px] text-slate-400">Playing a walkthrough is coming next.</p>
    </div>
  );
}
