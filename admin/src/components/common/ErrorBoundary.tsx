import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui';

/**
 * Catches render-time crashes so one broken screen cannot blank the whole
 * admin portal.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with a real reporter (Sentry et al.) when one is added.
    console.error('Admin render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <ErrorState
        title="This screen hit a snag"
        description="Reloading usually clears it. If it keeps happening, let engineering know."
        onRetry={() => this.setState({ hasError: false })}
      />
    );
  }
}

export default ErrorBoundary;
