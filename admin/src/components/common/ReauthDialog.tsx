import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { getErrorCode, getErrorMessage } from '@/api/client';
import { useSecurityStore } from '@/store/securityStore';
import { useAuthStore } from '@/store/authStore';
import { Button, Input, Modal } from '@/components/ui';

/**
 * "Confirm your password" prompt for sensitive actions (admin accounts,
 * roles, store settings, permanent deletes).
 *
 * Opened by the API client when the server answers REAUTH_REQUIRED; once the
 * password is confirmed the original request is retried automatically, so
 * the operator never has to redo what they were doing.
 */
export function ReauthDialog() {
  const pending = useSecurityStore((state) => Boolean(state.reauthResolver));
  const resolveReauth = useSecurityStore((state) => state.resolveReauth);
  const reauthMinutes = useSecurityStore((state) => state.policy.reauthMinutes);
  const email = useAuthStore((state) => state.user?.email ?? '');

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (pending) {
      setPassword('');
      setError('');
    }
  }, [pending]);

  const cancel = () => resolveReauth(false);

  const confirm = async () => {
    if (!password) return;
    setIsSubmitting(true);
    setError('');
    try {
      await authApi.reauth(password);
      setPassword('');
      resolveReauth(true);
    } catch (err) {
      if (getErrorCode(err) === 'ACCOUNT_LOCKED') {
        // The server has signed this session out; the app returns to login.
        resolveReauth(false);
        return;
      }
      setError(getErrorMessage(err, 'That password is not correct'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={pending}
      onClose={cancel}
      title="Confirm it's you"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={cancel} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={confirm} isLoading={isSubmitting} disabled={!password}>Confirm</Button>
        </>
      }
    >
      <form
        onSubmit={(event) => { event.preventDefault(); void confirm(); }}
        className="space-y-4"
      >
        <div className="flex gap-3 rounded-lg bg-canvas p-3 ring-1 ring-inset ring-line">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink-muted">
            This is a sensitive action. Enter your password to continue — you won't be asked again for {reauthMinutes} minutes.
          </p>
        </div>
        {/* Lets password managers match the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error || undefined}
        />
      </form>
    </Modal>
  );
}

export default ReauthDialog;
