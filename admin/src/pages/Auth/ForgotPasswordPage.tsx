import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';

import { authApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { Button, Input } from '@/components/ui';
import { AuthCard } from './AuthCard';

/**
 * Starts a self-service password reset. The answer is the same whether or
 * not the email is an admin account, so this page cannot be used to find
 * out who has access.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSentMessage('If that email belongs to an admin account, a reset link is on its way. Check your inbox — the link expires soon and works once.');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not send a reset link. Try again shortly.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your admin email and we'll send you a link to choose a new password."
    >
      {sentMessage ? (
        <div className="space-y-5">
          <p role="status" className="flex gap-2.5 rounded-lg border border-success/25 bg-success/5 px-3.5 py-3 text-sm leading-relaxed text-ink">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            {sentMessage}
          </p>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="you@humovare.in"
            className="h-11"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={error || undefined}
          />
          <Button type="submit" size="lg" fullWidth isLoading={isSubmitting}>
            Send reset link
          </Button>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  );
}

export default ForgotPasswordPage;
