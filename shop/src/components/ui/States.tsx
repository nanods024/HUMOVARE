import { PackageSearch, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { Button, ButtonLink } from './Button';
import { cn } from '@/utils/cn';

interface EmptyStateProps {
  icon?: typeof PackageSearch;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}

export function EmptyState({
  icon: Icon = PackageSearch,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex animate-fade-up flex-col items-center px-6 py-20 text-center', className)}>
      <span className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 text-primary shadow-[0_16px_36px_-20px_rgb(var(--color-primary)/0.6)]">
        <Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className="text-display-sm">{title}</h2>
      {description && <p className="mt-3 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && (
        <ButtonLink to={action.to} variant="primary" className="mt-7">
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  /** Network failures get different copy from server errors. */
  isOffline?: boolean;
  className?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  isOffline = false,
  className,
}: ErrorStateProps) {
  const Icon = isOffline ? WifiOff : AlertTriangle;

  return (
    <div
      role="alert"
      className={cn('flex animate-fade-up flex-col items-center px-6 py-20 text-center', className)}
    >
      <span className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-danger/10 text-danger">
        <Icon className="h-9 w-9" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className="text-display-sm">
        {title ?? (isOffline ? 'You appear to be offline' : 'Something went wrong')}
      </h2>
      <p className="mt-3 max-w-sm text-sm text-ink-muted">
        {description ??
          (isOffline
            ? 'Check your connection and try again.'
            : 'We could not load this right now. Please try again in a moment.')}
      </p>

      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-7">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

/** Inline spinner for regions that are refetching but already have content. */

