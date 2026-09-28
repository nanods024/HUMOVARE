import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { authApi, getErrorMessage } from '@/api';
import { useSeo } from '@/hooks/useSeo';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell, AuthLink } from './AuthShell';

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function ResetPasswordPage() {
  useSeo({ title: 'Set a new password', noindex: true });

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      await authApi.resetPassword({ token, password: values.password });
      // Every existing session was invalidated server-side, so sign in again.
      toast.success('Password updated. Please sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      setError('root', { message: getErrorMessage(error, 'That reset link is invalid or expired') });
    }
  };

  if (!token) {
    return (
      <AuthShell title="Link not valid" subtitle="This reset link is missing its token.">
        <p className="text-sm text-ink-muted">
          Request a fresh link from the{' '}
          <AuthLink to="/forgot-password">forgot password</AuthLink> page.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose something you have not used before.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {errors.root && (
          <p role="alert" className="border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
            {errors.root.message}
          </p>
        )}

        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          hint="At least 8 characters, with a letter and a number"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

export default ResetPasswordPage;
