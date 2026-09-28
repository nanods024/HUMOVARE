import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button, Input, Modal } from '@/components/ui';

/**
 * Confirmation for permanent deletes: the person types a word we show them
 * (an order number, an email) before the button unlocks. Slower than a plain
 * "Are you sure?" on purpose — there is no undo behind it.
 */
export function TypeToConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  children,
  confirmText,
  confirmLabel = 'Delete permanently',
  isLoading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  /** What must be typed to unlock the button. */
  confirmText: string;
  confirmLabel?: string;
  isLoading?: boolean;
}) {
  const [typed, setTyped] = useState('');

  // A fresh dialog never starts pre-confirmed.
  useEffect(() => {
    if (isOpen) setTyped('');
  }, [isOpen]);

  const matches = typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm} disabled={!matches} isLoading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg bg-danger/5 p-3 ring-1 ring-inset ring-danger/15">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <div className="space-y-2 text-sm leading-relaxed text-ink-muted">{children}</div>
        </div>
        <Input
          label={`Type ${confirmText} to confirm`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={confirmText}
          autoComplete="off"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && matches && !isLoading) onConfirm();
          }}
        />
      </div>
    </Modal>
  );
}

export default TypeToConfirmDialog;
