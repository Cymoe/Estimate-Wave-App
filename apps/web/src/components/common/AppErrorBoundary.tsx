import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Catches a render error anywhere in the app. Without it a thrown error
 * left a blank screen with nothing to tap; this says what broke and offers
 * to try again or reload.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App error', error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div role="alert" className="min-h-screen bg-[#000000] text-white flex items-center justify-center p-6" data-testid="app-crashed">
        <div className="max-w-md w-full bg-[#1a1a1a] border border-[#333] p-6">
          <h1 className="text-lg font-semibold">Something broke on this page</h1>
          <p className="mt-2 text-sm text-gray-400">Your work is saved as you go, so nothing is lost. Try again, or reload.</p>
          <p className="mt-3 text-xs text-gray-500 font-mono break-words">{this.state.error.message || String(this.state.error)}</p>
          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-4 py-2 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm text-gray-200 bg-[#1E1E1E] border border-[#333] hover:bg-[#2a2a2a]"
            >
              Reload the page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
