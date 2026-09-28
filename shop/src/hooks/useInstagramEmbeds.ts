import { useEffect, useState } from 'react';

const SCRIPT_SRC = 'https://www.instagram.com/embed.js';

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loads Instagram's embed script once for the whole page. */
function loadEmbedScript(): Promise<void> {
  if (window.instgrm) return Promise.resolve();

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('blocked')));
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('blocked'));
      document.body.appendChild(script);
    });
  }

  return scriptPromise;
}

export type EmbedStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Renders every Instagram blockquote currently on the page.
 *
 * One script and one `process()` call covers the whole wall — Instagram walks
 * the document and swaps each unprocessed blockquote for its own iframe, so
 * calling it per card would be wasted work.
 *
 * It only runs once `enabled` turns true, which the caller ties to the section
 * scrolling into view. A row of third-party iframes is the heaviest thing on
 * the home page and most visitors never reach it, so it should not be part of
 * the initial load.
 */
export function useInstagramEmbeds(enabled: boolean, count: number): EmbedStatus {
  const [status, setStatus] = useState<EmbedStatus>('idle');

  useEffect(() => {
    if (!enabled || count === 0) return undefined;

    let cancelled = false;
    setStatus('loading');

    // If nothing has rendered by now, a blocker or a dead post is the reason.
    const timeout = window.setTimeout(() => {
      if (!cancelled) setStatus((current) => (current === 'ready' ? current : 'failed'));
    }, 8000);

    loadEmbedScript()
      .then(() => {
        if (cancelled) return;
        window.instgrm?.Embeds.process();
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [enabled, count]);

  return status;
}
