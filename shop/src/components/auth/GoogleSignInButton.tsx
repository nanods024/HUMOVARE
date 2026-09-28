import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/api/auth';
import { queryKeys } from '@/lib/queryKeys';
import { cn } from '@/utils/cn';

/**
 * "Continue with Google", styled like the rest of the auth form.
 *
 * Google Identity Services only hands out a signed ID token through its own
 * button, and that button is small and fixed-size. So the shop draws its
 * own full-width button, and Google's real button is stretched over it,
 * transparent: the click lands on Google's button, Google runs the account
 * chooser, and the ID token it returns goes to the API, which verifies it
 * with Google before creating a session.
 *
 * Keyboard users tab straight onto Google's button (it carries its own
 * accessible label); the visual layer is hidden from assistive tech.
 *
 * Renders nothing when the shop has no Google client ID configured, or when
 * Google's script cannot load (blocked by an extension, offline), so the
 * email form always remains.
 */

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentity {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentity } };
  }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
/** Google's button is at most 400px wide; it is scaled up to fill ours. */
const GOOGLE_WIDTH = 400;
let scriptPromise: Promise<GoogleIdentity> | null = null;

/**
 * Google allows one `initialize` per page, so it is called once per client ID
 * and forwards to whichever button is mounted now.
 */
let initializedFor: string | null = null;
let activeCallback: ((credential: string) => void) | null = null;

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);

  scriptPromise ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('unavailable'));
    script.onerror = () => {
      scriptPromise = null; // allow a retry on the next mount
      script.remove();
      reject(new Error('blocked'));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Google's four-colour "G", per its branding guidelines. */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  /** Receives Google's ID token. May be async; the button shows a spinner meanwhile. */
  onCredential: (credential: string) => void | Promise<void>;
  label?: string;
  /** Wording Google uses for screen readers inside its iframe. */
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Rendered above the button, e.g. the "or" divider. Hidden with the button. */
  before?: React.ReactNode;
  /** Extra classes for the button frame (e.g. rounded corners). */
  className?: string;
}

export function GoogleSignInButton({
  onCredential,
  label = 'Continue with Google',
  text = 'continue_with',
  before,
  className,
}: GoogleSignInButtonProps) {
  const frame = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  // Google calls back long after render; always reach the latest handler.
  const handler = useRef(onCredential);
  handler.current = onCredential;

  const { data } = useQuery({
    queryKey: queryKeys.auth.providers,
    queryFn: authApi.providers,
    // Short enough that turning Google on shows up without a hard refresh.
    staleTime: 60_000,
    retry: false,
  });
  const clientId = data?.google?.clientId;

  useEffect(() => {
    if (!clientId || !target.current) return;
    let cancelled = false;

    loadGoogleIdentity()
      .then((identity) => {
        const parent = target.current;
        if (cancelled || !parent) return;

        activeCallback = async (credential) => {
          setBusy(true);
          try {
            await handler.current(credential);
          } finally {
            setBusy(false);
          }
        };

        if (initializedFor !== clientId) {
          identity.initialize({
            client_id: clientId,
            callback: ({ credential }) => activeCallback?.(credential),
            ux_mode: 'popup',
            cancel_on_tap_outside: true,
          });
          initializedFor = clientId;
        }

        parent.replaceChildren();
        identity.renderButton(parent, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          width: GOOGLE_WIDTH,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  // Stretch Google's (transparent) button over ours so every pixel of ours
  // is clickable. Recomputed whenever either one changes size.
  useLayoutEffect(() => {
    const outer = frame.current;
    const inner = target.current;
    if (!ready || !outer || !inner) return;

    const fit = () => {
      const w = inner.offsetWidth || GOOGLE_WIDTH;
      const h = inner.offsetHeight || 40;
      inner.style.transform = `scale(${outer.clientWidth / w}, ${outer.clientHeight / h})`;
    };
    fit();

    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [ready]);

  if (!clientId || failed) return null;

  return (
    <div>
      {before}
      <div
        ref={frame}
        className={cn(
          'group relative h-14 w-full overflow-hidden rounded-xl border border-line bg-canvas',
          'transition-colors duration-fast ease-brand hover:border-ink-black',
          'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink-black',
          !ready && 'opacity-60',
          className,
        )}
      >
        {/* What the shopper sees. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 text-sm font-semibold uppercase tracking-wider text-ink transition-colors group-hover:bg-ink-black/[0.04]"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleLogo className="h-5 w-5" />}
          {busy ? 'Signing you in…' : label}
        </div>

        {/* What receives the click: Google's own button, nearly invisible. */}
        <div
          ref={target}
          className={cn(
            'absolute left-0 top-0 origin-top-left opacity-[0.01]',
            busy && 'pointer-events-none',
          )}
          style={{ width: GOOGLE_WIDTH }}
        />
      </div>
    </div>
  );
}

/** "or" rule between the email form and the Google button. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-ink-subtle">
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
