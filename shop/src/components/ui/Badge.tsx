import { cn } from '@/utils/cn';

type BadgeVariant = 'sale' | 'new' | 'bestseller' | 'soldout' | 'lowstock' | 'neutral';

const VARIANTS: Record<BadgeVariant, string> = {
  sale: 'bg-primary text-white',
  // `ink-black` is the contrast slab, so `canvas` is the readable text on it.
  new: 'bg-ink-black text-canvas',
  bestseller: 'border border-ink-black/40 bg-canvas/80 text-ink backdrop-blur',
  soldout: 'bg-ink-subtle text-canvas',
  lowstock: 'bg-warning text-canvas',
  neutral: 'bg-surface text-ink-muted',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase leading-none tracking-wider shadow-sm',
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
