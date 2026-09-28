import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useToastStore, TOAST_DURATION, type ToastVariant } from '@/store/toastStore';

/**
 * Admin UI primitives.
 *
 * Grouped in one module because they are small, share conventions, and are
 * imported together on nearly every screen — splitting them across a dozen
 * files would add ceremony without improving anything.
 *
 * Motion rules: 150–400ms, eased out, and only ever to explain a change
 * (something appeared, something is pressed, something left). The global
 * prefers-reduced-motion rule in index.css turns all of it off.
 */

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium ' +
  'transition-all duration-200 ease-smooth active:scale-[0.97] ' +
  'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow-glow',
  secondary: 'bg-ink text-white shadow-sm hover:bg-ink/90 hover:shadow-lift',
  outline: 'border border-line bg-panel text-ink shadow-sm hover:border-ink-subtle/50 hover:bg-canvas',
  ghost: 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger/90 hover:shadow-[0_6px_16px_-6px_rgb(var(--admin-danger)/0.55)]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-6 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // An explicit type stops a button inside a form submitting it by accident.
      type={props.type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}>
      {children}
    </Link>
  );
}

// ── Form fields ──────────────────────────────────────────────────────────────

const FIELD =
  'w-full rounded-lg border border-line bg-panel px-3 text-sm text-ink shadow-[0_1px_2px_rgb(16_24_40/0.04)] ' +
  'placeholder:text-ink-subtle transition-[border-color,box-shadow,background-color] duration-200 ' +
  'hover:border-ink-subtle/50 focus:border-primary/70 focus:outline-none focus:ring-4 focus:ring-primary/10 ' +
  'disabled:cursor-not-allowed disabled:bg-canvas disabled:hover:border-line';

const FIELD_ERROR = 'border-danger/70 hover:border-danger focus:border-danger focus:ring-danger/10';

function FieldShell({
  id,
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  id: string;
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="ml-0.5 text-primary">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 animate-fade-in text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-subtle">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, containerClassName, id, required, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
      <input
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : undefined}
        className={cn(FIELD, 'h-9', error && FIELD_ERROR, className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, className, containerClassName, id, required, children, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
      {/* `className` sizes the control (w-44 in a filter bar, h-8 text-xs in a row), so it
          goes on both the wrapper — for width — and the select, for height and text. */}
      <div className={cn('relative', className)}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn(FIELD, 'h-9 cursor-pointer appearance-none pr-9', error && FIELD_ERROR, className)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden="true"
        />
      </div>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, containerClassName, id, required, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;

  return (
    <FieldShell id={fieldId} label={label} error={error} hint={hint} required={required} className={containerClassName}>
      <textarea
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(FIELD, 'min-h-[5rem] resize-y py-2', error && FIELD_ERROR, className)}
        {...props}
      />
    </FieldShell>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const generated = useId();
  const id = props.id ?? generated;

  return (
    <label
      htmlFor={id}
      className={cn('group flex cursor-pointer items-start gap-2.5 rounded-md', className)}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line accent-[rgb(var(--admin-primary))] transition-transform duration-150 group-active:scale-90"
        {...props}
      />
      <span className="text-sm">
        <span className="block text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-subtle">{description}</span>}
      </span>
    </label>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink/[0.04] text-ink-muted ring-line',
  success: 'bg-success/10 text-success ring-success/20',
  warning: 'bg-warning/10 text-warning ring-warning/25',
  danger: 'bg-danger/10 text-danger ring-danger/20',
  info: 'bg-info/10 text-info ring-info/20',
  primary: 'bg-primary/10 text-primary ring-primary/20',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ring-inset transition-colors',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Panel & page header ──────────────────────────────────────────────────────

export function Panel({ title, description, actions, children, className }: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('panel overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line/80 px-5 py-4">
          <div>
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, breadcrumbs, actions }: {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; to?: string }[];
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 animate-page-in">
      {breadcrumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-2.5">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {crumb.to ? (
                  <Link to={crumb.to} className="rounded transition-colors hover:text-primary">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={index === breadcrumbs.length - 1 ? 'font-medium text-ink-muted' : ''}>
                    {crumb.label}
                  </span>
                )}
                {index < breadcrumbs.length - 1 && <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

// ── States ───────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line/70" aria-busy="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 px-5 py-4 animate-fade-in"
          style={{ animationDelay: `${rowIndex * 40}ms` }}
        >
          {Array.from({ length: cols }).map((__, colIndex) => (
            <Skeleton key={colIndex} className={colIndex === 0 ? 'w-1/3' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon?: typeof Info;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex animate-fade-in flex-col items-center px-6 py-16 text-center">
      {Icon && (
        <span className="mb-4 grid h-14 w-14 animate-scale-in place-items-center rounded-2xl bg-gradient-to-b from-canvas to-panel ring-1 ring-line">
          <Icon className="h-6 w-6 text-ink-subtle" strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', description, onRetry }: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="flex animate-fade-in flex-col items-center px-6 py-16 text-center">
      <span className="mb-4 grid h-14 w-14 animate-scale-in place-items-center rounded-2xl bg-danger/10 ring-1 ring-danger/20">
        <AlertCircle className="h-6 w-6 text-danger" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────

/** How long the closing animation runs before the dialog leaves the DOM. */
const MODAL_EXIT_MS = 160;

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Stays mounted for a moment after `isOpen` turns false, so the dialog can
  // animate out instead of vanishing.
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsMounted(true);
      setIsClosing(false);
      return undefined;
    }
    if (!isMounted) return undefined;
    setIsClosing(true);
    const timer = window.setTimeout(() => {
      setIsMounted(false);
      setIsClosing(false);
    }, MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isOpen, isMounted]);

  // `onClose` is a fresh function on every render for most callers (an inline
  // arrow, or a parent re-rendering on its own state). Depending on it
  // directly reran this effect on every keystroke inside the modal — which
  // re-fired the 30ms focus timer and yanked focus back to the panel *while
  // the person was still typing*, so only the first character of anything
  // ever landed. A ref keeps the latest callback without making it a
  // dependency, so the effect (and the focus timer) only runs on open/close.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => panelRef.current?.focus(), 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen]);

  if (!isMounted) return null;

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-8">
      <div
        className={cn(
          'fixed inset-0 bg-ink/40 backdrop-blur-[3px]',
          isClosing ? 'animate-fade-out' : 'animate-fade-in',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-2xl bg-panel shadow-popover ring-1 ring-line/80 focus:outline-none',
          isClosing ? 'animate-scale-out' : 'animate-scale-in',
          widths[size],
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line/80 px-5 py-4">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-lg p-1.5 text-ink-muted transition-all duration-150 hover:rotate-90 hover:bg-canvas hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex justify-end gap-2 rounded-b-2xl border-t border-line/80 bg-canvas/40 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation for anything destructive — delete, disable, cancel. */
export function ConfirmDialog({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', isLoading, tone = 'danger' }: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  isLoading?: boolean;
  tone?: 'danger' | 'primary';
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-ink-muted">{message}</p>
    </Modal>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────

const TOAST_ICONS: Record<ToastVariant, typeof Check> = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

const TOAST_TONES: Record<ToastVariant, { chip: string; bar: string }> = {
  success: { chip: 'bg-success/10 text-success', bar: 'bg-success/60' },
  error: { chip: 'bg-danger/10 text-danger', bar: 'bg-danger/60' },
  info: { chip: 'bg-info/10 text-info', bar: 'bg-info/60' },
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2.5">
      {toasts.map((item) => {
        const Icon = TOAST_ICONS[item.variant];
        const tone = TOAST_TONES[item.variant];
        return (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-line/80 bg-panel/95 px-3.5 py-3 shadow-popover backdrop-blur',
              item.leaving ? 'animate-scale-out' : 'animate-toast-in',
            )}
          >
            <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', tone.chip)}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="flex-1 pt-0.5 text-sm leading-snug text-ink">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
              className="shrink-0 rounded-md p-1 text-ink-subtle transition-colors hover:bg-canvas hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {/* Time left before it dismisses itself. */}
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-0 bottom-0 h-0.5 origin-left', tone.bar)}
              style={{ animation: `toast-progress ${TOAST_DURATION}ms linear forwards` }}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

/** Page numbers to show: always the first, last and neighbours of the current. */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export function Pagination({ page, totalPages, total, onChange, pageSize = 20 }: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
  /** Rows per page, for the "Showing 21–40" line. */
  pageSize?: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const summary = total === 0
    ? 'No results'
    : (
      <>
        Showing <span className="font-medium text-ink">{from}–{to}</span> of{' '}
        <span className="font-medium text-ink">{total}</span> {total === 1 ? 'result' : 'results'}
      </>
    );

  if (totalPages <= 1) {
    return <div className="border-t border-line/80 px-5 py-3 text-xs text-ink-muted">{summary}</div>;
  }

  const go = (next: number) => {
    onChange(next);
    // A new page of rows starts at the top of the list, not wherever the
    // pager happened to be.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 px-5 py-3"
    >
      <p className="text-xs text-ink-muted">{summary}</p>
      <div className="flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => go(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </Button>
        {pageWindow(page, totalPages).map((entry, i) =>
          entry === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-ink-subtle" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => go(entry)}
              aria-label={`Page ${entry}`}
              aria-current={entry === page ? 'page' : undefined}
              className={cn(
                'h-8 min-w-[2rem] rounded-lg px-2 text-xs font-semibold transition-all duration-200 ease-smooth active:scale-95',
                entry === page
                  ? 'bg-primary text-white shadow-glow'
                  : 'text-ink-muted hover:bg-ink/[0.05] hover:text-ink',
              )}
            >
              {entry}
            </button>
          ),
        )}
        <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => go(page + 1)} aria-label="Next page">
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
