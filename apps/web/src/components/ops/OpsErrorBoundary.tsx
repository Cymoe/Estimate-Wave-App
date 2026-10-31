import { Component, type ReactNode } from 'react';
import { secondary } from './ui';

interface State {
  error: Error | null;
}

/**
 * A tab that throws while rendering used to take the whole Ops page down to
 * a blank screen with nothing to tap. This catches it, says what broke, and
 * offers to try the tab again or reload the page.
 */
export class OpsErrorBoundary extends Component<{ children: ReactNode; onHome?: () => void }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Ops page error', error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <div role="alert" className="m-4 md:m-6 p-4 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-200" data-testid="ops-crashed">
        <p className="font-medium">This part of Ops broke.</p>
        <p className="mt-1 text-red-200/80 break-words">{this.state.error.message || String(this.state.error)}</p>
        <div className="flex gap-2 mt-3">
          <button type="button" className={secondary} onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          {this.props.onHome && (
            <button
              type="button"
              className={secondary}
              onClick={() => {
                this.setState({ error: null });
                this.props.onHome?.();
              }}
            >
              Go to Intake
            </button>
          )}
          <button type="button" className={secondary} onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
