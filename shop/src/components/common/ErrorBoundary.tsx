import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui/States';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches render-time crashes so one broken section cannot blank the whole
 * storefront. Reset simply remounts the subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Replace with a real reporter (Sentry et al.) when one is added.
    console.error('Render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <ErrorState
        title="This page hit a snag"
        description="Reloading usually clears it. If it keeps happening, let us know."
        onRetry={() => this.setState({ hasError: false })}
      />
    );
  }
}

export default ErrorBoundary;
