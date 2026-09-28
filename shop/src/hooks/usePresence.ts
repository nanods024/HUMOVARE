import { useEffect, useState } from 'react';

/**
 * Keeps an element mounted long enough to animate out, with plain CSS
 * transitions instead of an animation library.
 *
 * `mounted` — render it at all. `shown` — apply the "open" styles. Opening
 * waits two frames so the closed styles paint first and the transition has
 * something to animate from; closing flips `shown` at once and unmounts after
 * `exitMs`.
 */
export function usePresence(isOpen: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }

    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [isOpen, exitMs]);

  return { mounted, shown };
}
