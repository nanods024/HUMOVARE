import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Package, Heart, Zap, Sparkles, ShieldCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  /** Small label above the title, e.g. "Members". */
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const PERKS: { icon: LucideIcon; title: string; copy: string }[] = [
  { icon: Package, title: 'Track every order', copy: 'Live status from packing to your door.' },
  { icon: Heart, title: 'Save what you love', copy: 'Your wishlist, on every device.' },
  { icon: Zap, title: 'Check out faster', copy: 'Saved addresses, one-tap payment.' },
  { icon: Sparkles, title: 'First look at drops', copy: 'New pieces before everyone else.' },
];

/**
 * Shared chrome for sign in / register / password reset.
 *
 * One full-bleed photograph behind the whole section. On desktop the brand
 * message and member perks sit on the left, over the darkest part of the
 * scrim, and the form floats on a solid card to the right so it stays
 * perfectly legible. On a phone the card sits centred over the photo.
 */
export function AuthShell({ title, subtitle, eyebrow = 'HUMOVARE Members', children, footer }: AuthShellProps) {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-5rem)] items-center overflow-hidden bg-ink-black">
      {/* ── Background ───────────────────────────────────────────────────── */}
      <img
        src="/hero-banner.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 -z-20 h-full w-full animate-hero-zoom object-cover object-center"
      />
      {/* Scrims: dark on the left for the headline, dark at the bottom for the
          perks, and a lighter veil overall so the card never fights the photo. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-black/45" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/40 to-black/20" />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
      <div aria-hidden="true" className="auth-float pointer-events-none absolute -right-24 top-10 -z-10 h-[28rem] w-[28rem] rounded-full bg-primary/30 blur-[110px]" />
      <div aria-hidden="true" className="auth-float pointer-events-none absolute -bottom-32 left-1/3 -z-10 h-[24rem] w-[24rem] rounded-full bg-primary/20 blur-[120px]" style={{ animationDelay: '-7s' }} />

      <div className="container-page grid w-full items-center gap-12 py-12 md:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,26rem)] lg:gap-16 xl:gap-24">
        {/* ── Brand message ──────────────────────────────────────────────── */}
        <div className="hidden text-white lg:block" aria-hidden="true">
          <p className="animate-fade-up text-[0.6875rem] font-bold uppercase tracking-[0.3em] text-white/70">
            Built for your movement
          </p>
          <p className="mt-5 animate-fade-up text-display-md uppercase leading-[0.95] xl:text-[3.75rem]" style={{ animationDelay: '80ms' }}>
            Not just clothing.
            <br />
            <span className="text-primary">A movement.</span>
          </p>
          <p className="mt-5 max-w-md animate-fade-up text-sm leading-relaxed text-white/70" style={{ animationDelay: '160ms' }}>
            Heavyweight tees, brushed hoodies and everyday layers — made to move with you.
          </p>

          <ul className="mt-10 grid max-w-xl gap-3 sm:grid-cols-2">
            {PERKS.map(({ icon: Icon, title, copy }, index) => (
              <li
                key={title}
                className="flex animate-fade-up items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:bg-white/[0.13]"
                style={{ animationDelay: `${240 + index * 90}ms` }}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-lg shadow-primary/40">
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/65">{copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Form card ──────────────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-[27rem] lg:mx-0 lg:justify-self-end">
          <div className="auth-card isolate bg-white/[0.97] p-7 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-9">
            <div className="auth-stagger">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[0.625rem] font-bold uppercase tracking-[0.22em] text-primary">
                <span className="auth-pulse h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                {eyebrow}
              </span>

              <h1 className="mt-4 text-display-sm uppercase">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{subtitle}</p>}
            </div>

            <div className="mt-8">{children}</div>

            {footer && (
              <div className="mt-6 animate-fade-in border-t border-line pt-5 text-center text-sm text-ink-muted" style={{ animationDelay: '600ms' }}>
                {footer}
              </div>
            )}
          </div>

          <p className="mt-5 flex animate-fade-in items-center justify-center gap-1.5 text-xs text-white/75" style={{ animationDelay: '700ms' }}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure sign-in · Your details are encrypted
          </p>
        </div>
      </div>
    </section>
  );
}

export function AuthLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="font-semibold text-ink underline decoration-line decoration-2 underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
    >
      {children}
    </Link>
  );
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  error?: string;
  /** Right-aligned element on the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
}

/**
 * Input with a leading icon, and a show/hide toggle for passwords. Kept
 * forwardRef so react-hook-form's `register` works unchanged.
 */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, icon: Icon, error, labelAction, type = 'text', required, className, id, ...props },
  ref,
) {
  const generated = useId();
  const fieldId = id ?? generated;
  const isPassword = type === 'password';
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor={fieldId} className="block text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted">
          {label}
          {required && <span className="ml-1 text-primary">*</span>}
        </label>
        {labelAction}
      </div>

      <div className="group relative">
        <Icon
          className={cn(
            'pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-all duration-300',
            error ? 'text-danger' : 'text-ink-subtle group-focus-within:scale-110 group-focus-within:text-primary',
          )}
          aria-hidden="true"
        />
        <input
          ref={ref}
          id={fieldId}
          type={isPassword && visible ? 'text' : type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(
            'h-12 w-full rounded-xl border bg-surface/60 pl-11 text-sm text-ink placeholder:text-ink-subtle',
            'transition-[border-color,box-shadow,background-color] duration-300 focus:outline-none',
            'focus:border-primary focus:bg-canvas focus:shadow-[0_0_0_4px_rgb(var(--color-primary)/0.12)]',
            isPassword ? 'pr-12' : 'pr-4',
            error ? 'border-danger bg-danger/5' : 'border-line hover:border-ink-muted',
            className,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-ink/5 hover:text-ink"
          >
            {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </div>

      {error && (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export default AuthShell;
