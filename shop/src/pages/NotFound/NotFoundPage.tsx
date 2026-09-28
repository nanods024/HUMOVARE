import { useSeo } from '@/hooks/useSeo';
import { ButtonLink } from '@/components/ui/Button';

export function NotFoundPage() {
  useSeo({ title: 'Page not found', noindex: true });

  return (
    <div className="container-page flex min-h-[64svh] flex-col items-center justify-center py-20 text-center">
      <p className="font-display text-display-xl leading-none text-primary">404</p>

      <h1 className="mt-4 text-display-sm">This page moved on</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-muted">
        The link may be old, or the piece may have sold out and been retired.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to="/" variant="primary">
          Back to home
        </ButtonLink>
        <ButtonLink to="/shop" variant="outline">
          Shop everything
        </ButtonLink>
      </div>
    </div>
  );
}

export default NotFoundPage;
