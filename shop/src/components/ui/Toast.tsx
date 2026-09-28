import { Link } from 'react-router-dom';
import { Check, Info, X, AlertCircle } from 'lucide-react';
import { useToastStore, type ToastVariant } from '@/store/toastStore';
import { cn } from '@/utils/cn';

const ICONS: Record<ToastVariant, typeof Check> = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

const ACCENT: Record<ToastVariant, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  info: 'bg-primary',
};

/**
 * Toasts replace browser alerts for every confirmation in the app.
 * The region is `aria-live` so the message is announced without stealing focus.
 */
export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[200] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
    >
      {toasts.map((item) => {
        const Icon = ICONS[item.variant];

        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center gap-3 overflow-hidden rounded-2xl border border-line bg-canvas/95 py-3 pl-0 pr-3 shadow-lift backdrop-blur',
              'transition-[opacity,transform] duration-200 ease-brand',
              // In on mount; out while the store holds it as `leaving`.
              item.leaving ? 'translate-y-2 scale-[0.97] opacity-0' : 'animate-fade-up',
            )}
          >
            <span className={`h-10 w-1 shrink-0 ${ACCENT[item.variant]}`} aria-hidden="true" />
            <Icon className="h-4 w-4 shrink-0 text-ink" aria-hidden="true" />

            <p className="min-w-0 flex-1 text-sm text-ink">{item.message}</p>

            {item.action && (
              <Link
                to={item.action.to}
                onClick={() => dismiss(item.id)}
                className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wider text-primary underline underline-offset-4"
              >
                {item.action.label}
              </Link>
            )}

            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
              className="shrink-0 p-1 text-ink-subtle transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default ToastViewport;
