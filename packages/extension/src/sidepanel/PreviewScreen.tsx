interface WalkthroughSummary {
  id: string;
  name: string;
  pathPattern: string;
  steps: number;
}

// Dummy data until the list is loaded from the backend (keyed by origin + path).
const DUMMY_WALKTHROUGHS: WalkthroughSummary[] = [
  { id: '1', name: 'Onboarding tour', pathPattern: '/orders/*', steps: 3 },
  { id: '2', name: 'Create an invoice', pathPattern: '/invoices/new', steps: 5 },
  { id: '3', name: 'Settings walkthrough', pathPattern: '/settings', steps: 2 },
];

/** Preview mode. Lists saved walkthroughs (dummy data for now). */
export function PreviewScreen(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">Saved walkthroughs for this page (sample data).</p>

      <ul className="flex flex-col gap-2">
        {DUMMY_WALKTHROUGHS.map((wt) => (
          <li key={wt.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:shadow"
            >
              <span className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">{wt.name}</span>
                <span className="font-mono text-xs text-slate-500">{wt.pathPattern}</span>
              </span>
              <span className="text-xs text-slate-400">{wt.steps} steps</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
