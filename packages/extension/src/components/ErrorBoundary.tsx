import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Stops a render error in the panel from blanking the whole UI. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[panel] render error', error, info);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center text-sm text-slate-700">
          <p className="font-medium">Something broke in the panel.</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
