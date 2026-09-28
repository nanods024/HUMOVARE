import { useState, type FormEvent } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { toast } from '@/store/toastStore';
import { isCustomerEmail, CUSTOMER_EMAIL_MESSAGE } from '@/utils/customerEmail';

/**
 * Newsletter capture.
 *
 * Phase 1 has no mailing-list provider wired up, so the form validates and
 * confirms locally. The submit handler is the single place to swap in a real
 * subscribe endpoint later.
 */
export function Newsletter() {
  const [email, setEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setError('Enter a valid email address');
      return;
    }

    if (!isCustomerEmail(clean)) {
      setError(CUSTOMER_EMAIL_MESSAGE);
      return;
    }

    setError('');
    setIsSubscribed(true);
    toast.success('You are on the list');
  };

  return (
    <section className="border-t border-line">
      <div className="container-page grid gap-8 py-14 md:grid-cols-2 md:items-center md:py-20">
        <div>
          <p className="eyebrow mb-3">Newsletter</p>
          <h2 className="text-display-md">Join the HUMOVARE list</h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-muted">
            Early access to drops, restock alerts and the occasional note from the studio. No spam,
            unsubscribe whenever.
          </p>
        </div>

        {isSubscribed ? (
          <p className="flex items-center gap-3 text-sm text-ink">
            <span className="success-pop grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0_10px_24px_-12px_rgb(var(--color-primary)/0.7)]">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
            Thanks — keep an eye on your inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="w-full">
            <div className="flex gap-1.5 rounded-2xl border border-line bg-canvas p-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[border-color,box-shadow] duration-300 focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgb(var(--color-primary)/0.12)] hover:border-ink-muted">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@gmail.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'newsletter-error' : undefined}
                className="h-12 min-w-0 flex-1 rounded-xl bg-transparent px-3 text-sm placeholder:text-ink-subtle focus:outline-none"
              />
              <button
                type="submit"
                className="group inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-[0_10px_24px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:bg-primary-dark active:scale-[0.97] disabled:opacity-60 sm:px-6"
              >
                Join now
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
              </button>
            </div>

            {error && (
              <p id="newsletter-error" role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

export default Newsletter;
