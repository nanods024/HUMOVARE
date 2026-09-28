/**
 * Shown while a lazily-loaded route chunk is downloading. Sized to roughly
 * a viewport so the footer does not jump up during the swap.
 */
export function RouteFallback() {
  return (
    <div className="container-page flex min-h-[60svh] items-center justify-center py-20">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" />
        <span className="text-[0.6875rem] uppercase tracking-brand text-ink-muted">Loading</span>
      </div>
    </div>
  );
}

export default RouteFallback;
