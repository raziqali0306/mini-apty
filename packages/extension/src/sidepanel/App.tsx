import { useAppStore } from '../store/use-app-store';
import { useWorkerPort } from '../hooks/use-worker-port';

/**
 * Side-panel shell. Presentational only — connection side effects come from
 * useWorkerPort, UI mode from the Zustand store. Auth, walkthrough list, author
 * and player views mount here as features are built.
 */
export function App(): JSX.Element {
  const { connected } = useWorkerPort();
  const mode = useAppStore((s) => s.mode);

  return (
    <div className="flex h-full min-h-screen flex-col gap-4 bg-slate-50 p-4 text-slate-900">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Mini Apty</h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-amber-500'}`}
          />
          {connected ? 'Worker connected' : 'Connecting…'}
        </span>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center">
        <p className="text-sm text-slate-500">
          Scaffold ready. Current mode: <span className="font-mono">{mode}</span>
        </p>
        <p className="mt-1 text-xs text-slate-400">Auth, author, and player flows land here.</p>
      </main>
    </div>
  );
}
