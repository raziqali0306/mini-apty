/**
 * Author mode. Placeholder for now — the next step wires up recording: arm the
 * content script, capture clicked elements with a Shadow-DOM affordance, edit
 * step title/description + advance trigger, and save to the backend.
 */
export function AuthorScreen(): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Author mode</h2>
        <p className="mt-1 text-xs text-slate-500">
          Recording is coming next: capture elements on the page, edit each step, and save.
        </p>
      </div>

      <button
        type="button"
        disabled
        className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Start recording
      </button>
    </div>
  );
}
