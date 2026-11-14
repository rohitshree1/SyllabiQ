import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected application error.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-slate-900">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
            <h1 className="font-display text-lg font-bold text-slate-900">
              SyllabiQ Recovery Mode
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              Something interrupted rendering ({this.state.errorMessage}). Reloading the workspace
              or clearing cached local state usually restores normal operation.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Reload SyllabiQ
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}
