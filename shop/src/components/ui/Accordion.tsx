import { useId, useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { cn } from '@/utils/cn';

interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Disclosure panel used for product details and FAQs. Long-form copy is
 * collapsed on mobile so the buy button stays within reach.
 */
export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className={cn('border-b border-line', className)}>
      <h3>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={`${id}-panel`}
          className="flex w-full items-center justify-between gap-4 rounded-xl py-4 text-left text-xs font-semibold uppercase tracking-wider transition-colors hover:text-primary"
        >
          {title}
          {isOpen ? (
            <Minus className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </h3>

      {/* Height animates via grid rows (0fr → 1fr), so no JS measuring. While
          closed it is also `invisible`, which keeps it out of the tab order
          and away from screen readers. */}
      <div
        id={`${id}-panel`}
        role="region"
        className={cn(
          'grid transition-[grid-template-rows,opacity,visibility] duration-base ease-brand',
          isOpen ? 'visible grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="pb-5 text-sm leading-relaxed text-ink-muted">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default AccordionItem;
