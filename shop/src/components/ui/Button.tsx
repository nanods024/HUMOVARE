import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { safeHref } from '@/utils/safeHref';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'glass' | 'link';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold uppercase tracking-wider ' +
  'transition-all duration-300 ease-brand active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ' +
  'select-none whitespace-nowrap';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-white shadow-[0_10px_24px_-12px_rgb(var(--color-primary)/0.7)] hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-[0_16px_30px_-12px_rgb(var(--color-primary)/0.75)]',
  // `ink-black` is the maximum-contrast slab: off-white on the dark canvas.
  secondary: 'bg-ink-black text-canvas hover:-translate-y-0.5 hover:bg-ink-black/85 hover:shadow-lift',
  outline: 'border border-line bg-canvas text-ink hover:-translate-y-0.5 hover:border-ink-black hover:bg-ink-black hover:text-canvas',
  ghost: 'text-ink hover:bg-surface',
  // Glass treatment, for buttons that sit over photography.
  glass: 'border border-white/35 bg-white/10 text-white backdrop-blur hover:bg-white hover:text-ink-black',
  link: 'rounded-none text-ink underline underline-offset-4 hover:text-primary px-0 active:scale-100',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[0.6875rem]',
  md: 'h-12 px-7 text-xs',
  lg: 'h-14 px-9 text-sm',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  fullWidth?: boolean;
  className?: string;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, CommonProps {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', isLoading, fullWidth, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // An explicit type prevents a button inside a form from submitting it
      // by accident — a classic source of phantom form posts.
      type={props.type ?? 'button'}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        BASE,
        VARIANTS[variant],
        variant !== 'link' && SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends CommonProps {
  to: string;
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}

/** Same visual language as Button, but renders a router link. Unsafe targets fall back to "/". */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      to={safeHref(to, '/')}
      className={cn(
        BASE,
        VARIANTS[variant],
        variant !== 'link' && SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  );
}

export default Button;
