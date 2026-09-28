import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useScrollLock } from '@/hooks/useScrollLock';
import { usePresence } from '@/hooks/usePresence';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Where the panel enters from. `center` is a dialog, the rest are drawers. */
  position?: 'center' | 'right' | 'left' | 'bottom' | 'top';
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  hideCloseButton?: boolean;
}

const PANEL_POSITION: Record<string, string> = {
  center: 'inset-0 m-auto h-fit max-h-[90dvh] w-[calc(100%-2rem)] overflow-hidden rounded-3xl',
  right: 'inset-y-0 right-0 h-full w-full overflow-hidden sm:rounded-l-3xl',
  left: 'inset-y-0 left-0 h-full w-full overflow-hidden sm:rounded-r-3xl',
  bottom: 'inset-x-0 bottom-0 max-h-[88dvh] w-full overflow-hidden rounded-t-3xl',
  top: 'inset-x-0 top-0 w-full overflow-hidden rounded-b-3xl',
};

const PANEL_SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  full: 'max-w-none',
};

/** Where each panel sits while closed; the transition animates it into place. */
const PANEL_HIDDEN: Record<string, string> = {
  center: 'scale-[0.97] opacity-0',
  right: 'translate-x-full',
  left: '-translate-x-full',
  bottom: 'translate-y-full',
  // A short drop with a fade — a full slide from off-screen feels heavy here.
  top: '-translate-y-7 opacity-0',
};

const EXIT_MS = 280;

/**
 * Accessible dialog: focus moves in on open, Escape closes, Tab is trapped
 * inside the panel, and focus returns to whatever opened it.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  position = 'center',
  size = 'md',
  className,
  hideCloseButton,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useScrollLock(isOpen);
  const { mounted, shown } = usePresence(isOpen, EXIT_MS);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocused.current = document.activeElement as HTMLElement;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    // Focus the panel itself rather than the first control, so a screen
    // reader announces the dialog title before its contents.
    const timer = window.setTimeout(() => panelRef.current?.focus(), 40);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusables();
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, onClose]);

  return createPortal(
    mounted ? (
      <div className="fixed inset-0 z-[100]" role="presentation">
        <div
          className={cn(
            'absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200',
            shown ? 'opacity-100' : 'opacity-0',
          )}
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          className={cn(
            'absolute flex flex-col bg-canvas shadow-lift focus:outline-none',
            'transition-[transform,opacity] duration-[280ms] ease-brand',
            PANEL_POSITION[position],
            PANEL_SIZE[size],
            !shown && PANEL_HIDDEN[position],
            className,
          )}
        >
          {(title || !hideCloseButton) && (
            <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-ink-muted transition-all duration-300 hover:rotate-90 hover:bg-surface hover:text-ink"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </header>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      </div>
    ) : null,
    document.body,
  );
}

export default Modal;
