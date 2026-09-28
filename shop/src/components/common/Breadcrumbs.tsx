import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { SITE_URL } from '@/constants';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Breadcrumb trail plus matching BreadcrumbList JSON-LD, so the same data
 * serves both the shopper and the search engine.
 */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const trail: Crumb[] = [{ label: 'Home', to: '/' }, ...items];

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(crumb.to ? { item: `${SITE_URL}${crumb.to}` } : {}),
    })),
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className={cn('text-xs text-ink-muted', className)}>
        <ol className="flex flex-wrap items-center gap-1">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;

            return (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {crumb.to && !isLast ? (
                  <Link to={crumb.to} className="transition-colors hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined} className="text-ink">
                    {crumb.label}
                  </span>
                )}

                {!isLast && <ChevronRight className="h-3 w-3 text-ink-subtle" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      </nav>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
    </>
  );
}

export default Breadcrumbs;
