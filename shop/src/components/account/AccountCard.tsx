import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';

/**
 * The rounded panel every account page is built from: an icon chip, a title,
 * an optional line of help and optional actions on the right.
 */
export function AccountCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  headingId,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headingId?: string;
}) {
  return (
    <section aria-labelledby={title ? headingId : undefined} className={cn('acct-card overflow-hidden', className)}>
      {title && (
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6 sm:py-4">
          {Icon && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-sm font-bold uppercase tracking-wider text-ink">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={cn('p-4 sm:p-6', bodyClassName)}>{children}</div>
    </section>
  );
}

export default AccountCard;
