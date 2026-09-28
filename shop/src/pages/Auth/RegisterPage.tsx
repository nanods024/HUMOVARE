import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getErrorMessage } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthShell, AuthLink } from './AuthShell';
import { GoogleSignInButton, AuthDivider } from '@/components/auth/GoogleSignInButton';
import { toast } from '@/store/toastStore';
import { isCustomerEmail, CUSTOMER_EMAIL_MESSAGE } from '@/utils/customerEmail';

// Mirrors the server's password policy so the shopper is told before they submit.
const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name'),
    email: z
      .string()
      .trim()
      .email('Enter a valid email address')
      .refine(isCustomerEmail, CUSTOMER_EMAIL_MESSAGE),
    phone: z
      .string()
      .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number')
      .or(z.literal('')),
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

export function RegisterPage() {
  useSeo({
    title: 'Create an account',
    description: 'Join HUMOVARE to track orders, save pieces and check out faster.',
    noindex: true,
  });

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register: signUp, loginWithGoogle, isAuthenticated } = useAuth();
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
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { phone: '' } });

  const onSubmit = async (values: FormValues) => {
    try {
      await signUp({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
      });
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setError('root', { message: getErrorMessage(error, 'We could not create your account') });
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
      title="Create account"
      subtitle="It takes about thirty seconds."
      footer={
        <p>
          Already have an account? <AuthLink to="/login">Sign in</AuthLink>
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
          label="Full name"
          autoComplete="name"
          autoFocus
          required
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@gmail.com"
          hint="We only accept Gmail addresses."
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Phone"
          type="tel"
          inputMode="numeric"
          maxLength={10}
          autoComplete="tel"
          hint="Optional — used for delivery updates"
          error={errors.phone?.message}
          {...register('phone')}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters, with a letter and a number"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isSubmitting}>
          Create account
        </Button>

        <p className="text-xs leading-relaxed text-ink-subtle">
          By creating an account you agree to our <AuthLink to="/terms">terms</AuthLink> and{' '}
          <AuthLink to="/privacy">privacy policy</AuthLink>.
        </p>
      </form>

      <GoogleSignInButton
        onCredential={onGoogle}
        text="signup_with"
        label="Sign up with Google"
        before={<AuthDivider label="or" />}
      />
    </AuthShell>
  );
}

export default RegisterPage;
