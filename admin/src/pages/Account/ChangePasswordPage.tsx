import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { useSecurityStore } from '@/store/securityStore';
import { passwordMeetsPolicy } from '@/lib/passwordPolicy';
import { PasswordChecklist } from '@/components/common/PasswordChecklist';
import { toast } from '@/store/toastStore';
import { PageHeader, Panel, Button, Input } from '@/components/ui';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const mustChange = useAuthStore((state) => Boolean(state.user?.mustChangePassword));
  const setPolicy = useSecurityStore((state) => state.setPolicy);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const change = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: current, newPassword: next }),
    onSuccess: (session) => {
      // Every other session was invalidated server-side; adopt the fresh one.
      setPolicy(session.security);
      setSession(session.user, session.permissions, session.csrfToken);
      toast.success('Password updated — your other sessions were signed out');
      navigate('/dashboard');
    },
    onError: (err) => setError(getErrorMessage(err, 'Could not change your password')),
  });

  const submit = () => {
    setError('');
    if (next !== confirm) {
      setError('The new passwords do not match');
      return;
    }
    change.mutate();
  };

  return (
    <>
      <PageHeader
        title={mustChange ? 'Choose your own password' : 'Change password'}
        description={
          mustChange
            ? 'Your password was set by someone else. Replace it to open the rest of the admin panel.'
            : 'Changing your password signs out every other session on your account.'
        }
        breadcrumbs={[{ label: 'Account' }, { label: 'Password' }]}
      />

      <Panel className="max-w-md">
        <div className="space-y-4 p-5">
          {error && (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2.5 text-sm text-danger">
              {error}
            </p>
          )}

          <Input
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <div>
            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <PasswordChecklist value={next} className="mt-2" />
          </div>
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          <Button
            fullWidth
            onClick={submit}
            isLoading={change.isPending}
            disabled={!current || !passwordMeetsPolicy(next) || next !== confirm}
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Update password
          </Button>
        </div>
      </Panel>
    </>
  );
}

export default ChangePasswordPage;
