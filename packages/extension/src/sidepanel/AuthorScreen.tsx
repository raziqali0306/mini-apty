import { useEffect } from 'react';
import { useAuthorStore } from '../store/use-author-store';
import { ADVANCE_TRIGGER_KINDS, type AdvanceTriggerKind, type DraftStep } from '../content/targeting/types';
import type { ApiError } from '../shared/messages';

const TRIGGER_LABELS: Record<AdvanceTriggerKind, string> = {
  'next-button': 'Next button',
  'click-target': 'Click element',
  'input-change': 'Input change',
};

function bannerMessage(error: ApiError | null): string | null {
  if (!error) return null;
  switch (error.kind) {
    case 'network':
      return "Can't reach the server. Is the backend running?";
    case 'auth':
      return error.message || 'Please sign in again.';
    case 'validation':
      return error.message || 'Please check the walkthrough.';
    default:
      return error.message || 'Something went wrong.';
  }
}

/** Short, human label for a captured step's target. */
function targetLabel(step: DraftStep): string {
  const { attrs, text } = step.target;
  return attrs.selector ?? attrs.testId ?? (text.accessibleName ? `"${text.accessibleName}"` : text.tag);
}

export function AuthorScreen(): JSX.Element {
  const recording = useAuthorStore((s) => s.recording);
  const starting = useAuthorStore((s) => s.starting);
  const steps = useAuthorStore((s) => s.steps);
  const context = useAuthorStore((s) => s.context);
  const name = useAuthorStore((s) => s.name);
  const pattern = useAuthorStore((s) => s.pattern);
  const saveStatus = useAuthorStore((s) => s.saveStatus);
  const savedOffline = useAuthorStore((s) => s.savedOffline);
  const error = useAuthorStore((s) => s.error);
  const {
    loadContext,
    start,
    stop,
    updateStep,
    removeStep,
    setName,
    setPattern,
    save,
    reset,
  } = useAuthorStore.getState();

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  if (saveStatus === 'saved') {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          className={`text-sm font-semibold ${savedOffline ? 'text-amber-700' : 'text-emerald-700'}`}
        >
          {savedOffline ? 'Saved locally — sync pending' : 'Walkthrough saved ✓'}
        </div>
        <p className="text-xs text-slate-500">
          {savedOffline
            ? "Backend unreachable; it'll sync automatically when you're back online."
            : "It's stored on the backend for this page."}
        </p>
        <button
          type="button"
          onClick={() => {
            reset();
            void loadContext();
          }}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Record another
        </button>
      </div>
    );
  }

  const banner = bannerMessage(error);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
        {context ? (
          <>
            Recording target: <span className="font-mono">{context.origin}</span>
            <span className="font-mono text-slate-400">{context.path}</span>
          </>
        ) : (
          'Reading the current tab…'
        )}
      </div>

      {banner && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {banner}
        </div>
      )}

      {recording ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            Recording — click elements on the page
          </span>
          <button
            type="button"
            onClick={() => void stop()}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100"
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting || !context}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {starting ? 'Starting…' : steps.length > 0 ? 'Resume recording' : 'Start recording'}
        </button>
      )}

      {steps.length === 0 ? (
        <p className="text-center text-xs text-slate-400">
          No steps yet. Start recording and click elements to capture them.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <li key={step.tempId} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Step {i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeStep(step.tempId)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
              <p className="mb-2 truncate font-mono text-[11px] text-slate-400" title={targetLabel(step)}>
                {targetLabel(step)}
              </p>
              <input
                value={step.title}
                onChange={(e) => updateStep(step.tempId, { title: e.target.value })}
                placeholder="Step title"
                className="mb-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
              />
              <textarea
                value={step.description}
                onChange={(e) => updateStep(step.tempId, { description: e.target.value })}
                placeholder="Description (shown to the end-user)"
                rows={2}
                className="mb-2 w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
              />
              <label className="flex items-center justify-between text-xs text-slate-500">
                Advance on
                <select
                  value={step.advanceTrigger}
                  onChange={(e) =>
                    updateStep(step.tempId, { advanceTrigger: e.target.value as AdvanceTriggerKind })
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                >
                  {ADVANCE_TRIGGER_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {TRIGGER_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ol>
      )}

      {steps.length > 0 && !recording && (
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Onboarding tour"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            Path pattern
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="/orders/*"
              className="rounded-md border border-slate-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-slate-500"
            />
          </label>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saveStatus === 'saving'}
            className="mt-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? 'Saving…' : 'Save walkthrough'}
          </button>
        </div>
      )}
    </div>
  );
}
