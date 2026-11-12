import React from 'react';

interface State {
  error: Error | null;
}

/** Shows what went wrong instead of an empty window when a view fails to render. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Gitter view failed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="h-screen flex items-center justify-center p-6 bg-[#14181f] text-slate-200">
        <div className="max-w-xl w-full space-y-3">
          <h1 className="text-sm font-semibold text-rose-300">Something in Gitter broke.</h1>
          <pre className="p-3 rounded bg-[#1b212c] border border-[#2a3447] text-[11px] text-slate-300 whitespace-pre-wrap max-h-64 overflow-auto select-text">{error.stack || error.message}</pre>
          <div className="flex gap-2">
            <button onClick={() => this.setState({ error: null })} className="px-3 py-1.5 rounded bg-[#202735] border border-[#2a3447] text-xs">
              Try again
            </button>
            <button onClick={() => window.location.reload()} className="px-3 py-1.5 rounded bg-teal-500 text-white text-xs font-semibold">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
