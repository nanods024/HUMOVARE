import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, ShieldCheck, ScrollText, Boxes, Clock, Info } from 'lucide-react';

import { getErrorMessage, getErrorCode, getErrorDetails } from '@/api/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useSecurityStore, SIGNED_OUT_MESSAGES } from '@/store/securityStore';
import { Button, Input } from '@/components/ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Two fields do not need a form library; the server re-validates anyway. */
function validate(email: string, password: string) {
  const errors: { email?: string; password?: string } = {};
  if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Enter your password';
  return errors;
}

const mmss = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, isAuthenticated } = useAdminAuth();

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const policy = useSecurityStore((state) => state.policy);
  const signedOutReason = useSecurityStore((state) => state.signedOutReason);
  const setSignedOutReason = useSecurityStore((state) => state.setSignedOutReason);
  const notice = signedOutReason ? SIGNED_OUT_MESSAGES[signedOutReason] : null;

  // While the server says sign-in is locked, count down and hold the form.
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;
  const isLocked = secondsLeft > 0;

  useEffect(() => {
    if (!lockedUntil) return undefined;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [lockedUntil]);

  // Never leave an already-signed-in operator staring at a login form.
  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocked || isSubmitting) return;

    const errors = validate(email, password);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    setSignedOutReason(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (getErrorCode(error) === 'ACCOUNT_LOCKED') {
        const seconds = getErrorDetails<{ retryAfterSeconds?: number }>(error)?.retryAfterSeconds ?? policy.lockMinutes * 60;
        setLockedUntil(Date.now() + seconds * 1000);
        setNow(Date.now());
      }
      // The API deliberately does not say which field was wrong.
      setFormError(getErrorMessage(error, 'Email or password is incorrect'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel — decorative, desktop only. */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#16181f] via-[#101217] to-[#0a0b0e] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-primary/15 blur-3xl" aria-hidden="true" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(rgb(255 255 255) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          aria-hidden="true"
        />

        <div className="relative flex animate-fade-in items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[#e5323a] to-primary-dark text-base font-bold shadow-glow">
            H
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">HUMOVARE</span>
            <span className="block text-xs text-white/45">Admin portal</span>
          </span>
        </div>

        <div className="relative max-w-md stagger">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">
            Run the whole store from one calm place.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Catalogue, stock, orders and the storefront — with every change recorded.
          </p>
          <ul className="mt-10 space-y-4 text-sm text-white/75">
            {[
              { icon: Boxes, text: 'Products, stock and orders side by side' },
              { icon: ShieldCheck, text: 'Role-based access for every admin' },
              { icon: ScrollText, text: 'Every administrative action audited' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-red-300" strokeWidth={1.75} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/30">© {new Date().getFullYear()} HUMOVARE</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm animate-page-in">
          <div className="mb-8">
            <span className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#e5323a] to-primary-dark text-base font-bold text-white shadow-glow lg:hidden">
              H
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h1>
            <p className="mt-1.5 text-sm text-ink-muted">Sign in to manage the HUMOVARE store.</p>
          </div>

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {notice && !formError && (
              <p role="status" className="flex animate-scale-in gap-2 rounded-lg border border-info/25 bg-info/5 px-3 py-2.5 text-sm text-ink">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                {notice}
              </p>
            )}

            {isLocked ? (
              <div role="alert" className="animate-scale-in rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-sm text-danger">
                <p className="flex items-center gap-2 font-semibold">
                  <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Sign-in temporarily locked
                </p>
                <p className="mt-1 leading-relaxed text-danger/90">
                  Too many wrong passwords. Try again in{' '}
                  <span className="font-semibold tabular">{mmss(secondsLeft)}</span>, or reset your password.
                </p>
              </div>
            ) : (
              formError && (
                <p role="alert" className="animate-scale-in rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm text-danger">
                  {formError}
                </p>
              )
            )}

            <Input
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              placeholder="you@humovare.in"
              className="h-11"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={fieldErrors.email}
            />

            <div>
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="h-11"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={fieldErrors.password}
              />
              <div className="mt-1.5 text-right">
                <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={isLocked} className="mt-1">
              <Lock className="h-4 w-4" aria-hidden="true" />
              {isLocked ? `Locked · ${mmss(secondsLeft)}` : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 flex items-center gap-2 text-xs text-ink-subtle">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {policy.lockoutScope === 'panel'
              ? `After ${policy.ipMaxAttempts} wrong passwords, the admin panel is locked for everyone for ${policy.ipBlockMinutes} minutes.`
              : `After ${policy.ipMaxAttempts} wrong passwords, the admin panel is blocked on this network for ${policy.ipBlockMinutes} minutes.`}
          </p>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
