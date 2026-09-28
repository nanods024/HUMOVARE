import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface RevealProps {
  children: ReactNode;
  /** Stagger within a group, in milliseconds. */
  delay?: number;
  as?: ElementType;
  className?: string;
}

/**
 * Reveals its children once they scroll into view.
 *
 * Deliberately an IntersectionObserver plus two CSS classes rather than a
 * motion library: it costs nothing in bundle size, the transition runs on the
 * compositor, and it fires once and then disconnects.
 *
 * The element starts *visible* and is only hidden after the observer has been
 * attached, so if JavaScript never runs the content is still on the page —
 * the same reasoning behind the CSS-driven hero entrance.
 */
export function Reveal({ children, delay = 0, as: Tag = 'div', className }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isArmed, setIsArmed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    // Respect the OS setting: show immediately, never animate.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true);
      return undefined;
    }

    setIsArmed(true);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.disconnect();
      },
      // Start a little before the block reaches the fold so it is already
      // settling by the time it is properly on screen.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );

    observer.observe(node);

    // Safety net: whatever happens — a throttled tab, an observer that never
    // fires, a browser that will not run the transition — the content is
    // revealed. Nothing on the page may stay invisible waiting on an effect.
    const failsafe = window.setTimeout(() => {
      setIsVisible(true);
      observer.disconnect();
    }, 1500);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      style={isArmed && !isVisible ? undefined : { transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-[opacity,transform] duration-slow ease-brand motion-reduce:transition-none',
        isArmed && !isVisible ? 'translate-y-6 opacity-0' : 'translate-y-0 opacity-100',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
