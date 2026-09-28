import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getErrorMessage } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/Button';
import { Mail, Lock, AlertCircle, ArrowRight, UserPlus } from 'lucide-react';
import { AuthShell, AuthField } from './AuthShell';
import { GoogleSignInButton, AuthDivider } from '@/components/auth/GoogleSignInButton';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  useSeo({ title: 'Sign in', description: 'Sign in to your HUMOVARE account.', noindex: true });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, loginWithGoogle, isAuthenticated } = useAuth();

  // Never leave an already-signed-in shopper staring at a login form.
  const redirectTo = searchParams.get('redirect') || '/account';

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    try {
      const session = await login(values);
      toast.success(`Welcome back, ${session.user.name.split(' ')[0]}`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      // The API deliberately does not say which field was wrong.
      setError('root', { message: getErrorMessage(error, 'Email or password is incorrect') });
    }
  };

  const onGoogle = async (credential: string) => {
    clearErrors('root');
    try {
      const session = await loginWithGoogle(credential);
      const firstName = session.user.name.split(' ')[0];
      toast.success(session.created ? `Welcome to HUMOVARE, ${firstName}` : `Welcome back, ${firstName}`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setError('root', { message: getErrorMessage(error, 'Google sign-in failed. Please try again.') });
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to track orders, see your wishlist and check out faster."
      footer={
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-subtle">New to HUMOVARE?</p>
          <Link
            to="/register"
            className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 text-sm font-semibold uppercase tracking-wider text-primary transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:bg-primary hover:text-white hover:shadow-[0_14px_30px_-12px_rgb(var(--color-primary)/0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:translate-y-0"
          >
            <UserPlus className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
            Create an account
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="auth-stagger space-y-5">
        {errors.root && (
          <p role="alert" className="flex animate-fade-in items-start gap-2.5 border-l-2 border-danger bg-danger/5 px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {errors.root.message}
          </p>
        )}

        <AuthField
          label="Email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@gmail.com"
          autoFocus
          required
          error={errors.email?.message}
          {...register('email')}
        />

        <AuthField
          label="Password"
          icon={Lock}
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          error={errors.password?.message}
          labelAction={
            <Link to="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
              Forgot password?
            </Link>
          }
          {...register('password')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          className="auth-shine group h-12 rounded-xl shadow-[0_14px_30px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-12px_rgb(var(--color-primary)/0.8)] active:translate-y-0"
        >
          Sign in
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Button>
      </form>

      <GoogleSignInButton
        onCredential={onGoogle}
        text="continue_with"
        label="Continue with Google"
        before={<AuthDivider label="or" />}
        className="rounded-xl border-line transition-all duration-300 hover:-translate-y-0.5 hover:border-ink-muted hover:shadow-lg"
      />
    </AuthShell>
  );
}

export default LoginPage;
