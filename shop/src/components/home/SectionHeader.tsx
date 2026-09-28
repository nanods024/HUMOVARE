import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  link?: { label: string; to: string };
  align?: 'left' | 'center';
  className?: string;
}

/** Shared heading block so every homepage section shares one rhythm. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  link,
  align = 'left',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between',
        align === 'center' && 'items-center text-center md:flex-col md:items-center',
        className,
      )}
    >
      <div className={cn('max-w-xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="text-display-md">{title}</h2>
        {description && <p className="mt-3 text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>

      {link && (
        <Link
          to={link.to}
          className="group inline-flex shrink-0 items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors hover:text-primary"
        >
          {link.label}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-base ease-brand group-hover:translate-x-1"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  );
}

export default SectionHeader;
