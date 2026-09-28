import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { useSecurityStore } from '@/store/securityStore';
import { passwordMeetsPolicy } from '@/lib/passwordPolicy';
import { PasswordChecklist } from '@/components/common/PasswordChecklist';
import { Button, Input } from '@/components/ui';
import { AuthCard } from './AuthCard';

/** Completes a reset from the emailed one-time link. */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSignedOutReason = useSecurityStore((state) => state.setSignedOutReason);

  // Read the token once, then drop it from the address bar so it does not
  // linger in browser history or get shared by accident.
  const [token] = useState(() => searchParams.get('token') ?? '');
  useEffect(() => {
    if (searchParams.get('token')) window.history.replaceState(null, '', window.location.pathname);
  }, [searchParams]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validToken = /^[a-f0-9]{64}$/.test(token);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setIsSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      setSignedOutReason('PASSWORD_RESET');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not reset your password'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!validToken) {
    return (
      <AuthCard title="This link doesn't work" description="The reset link is incomplete or has already been used. Request a new one.">
        <Link to="/forgot-password" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="After this, every device signed in to your account is signed out.">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}
        <div>
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            className="h-11"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <PasswordChecklist value={password} className="mt-2" />
        </div>
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          className="h-11"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          error={confirm && confirm !== password ? 'The passwords do not match' : undefined}
        />
        <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} disabled={!passwordMeetsPolicy(password) || password !== confirm}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Set new password
        </Button>
      </form>
    </AuthCard>
  );
}

export default ResetPasswordPage;
