import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MailCheck } from 'lucide-react';
import { authApi, getErrorMessage } from '@/api';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell, AuthLink } from './AuthShell';

const schema = z.object({ email: z.string().trim().email('Enter a valid email address') });
type FormValues = z.infer<typeof schema>;

export function ForgotPasswordPage() {
  useSeo({ title: 'Reset your password', noindex: true });

  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      // The reset link travels only by email. The response is identical
      // whether or not the address is registered.
      await authApi.forgotPassword(values.email);
      setSent(true);
    } catch (error) {
      setError('root', { message: getErrorMessage(error, 'We could not send that link') });
    }
  };

  if (sent) {
    return (
      <AuthShell title="Check your inbox" subtitle="If that email is registered, a reset link is on its way.">
        <div className="space-y-5">
          <p className="flex items-start gap-3 border border-line bg-surface p-4 text-sm text-ink-muted">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
            The link expires in 30 minutes. If it does not arrive, check your spam folder.
          </p>

          <AuthLink to="/login">Back to sign in</AuthLink>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we will send you a reset link."
      footer={
        <p>
          Remembered it? <AuthLink to="/login">Sign in</AuthLink>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {errors.root && (
          <p role="alert" className="border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
            {errors.root.message}
          </p>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}

export default ForgotPasswordPage;
