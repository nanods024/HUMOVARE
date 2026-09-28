import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, MapPin, Heart, UserRound, KeyRound, ArrowUpRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

import { usersApi, authApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AccountCard } from '@/components/account/AccountCard';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'),
  phone: z
    .string()
    .regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number')
    .or(z.literal('')),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .regex(/[a-zA-Z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export function ProfilePage() {
  useSeo({ title: 'Profile', noindex: true });

  const queryClient = useQueryClient();
  const setUser = useAuthStore((state) => state.setUser);

  const { data: profile } = useQuery({
    queryKey: queryKeys.user.profile,
    queryFn: () => usersApi.me().then((res) => res.user),
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: '', phone: '' },
  });

  // Populate once the profile arrives (the form mounts before the query lands).
  useEffect(() => {
    if (profile) {
      profileForm.reset({ name: profile.name, phone: profile.phone ?? '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: usersApi.updateProfile,
    onSuccess: ({ user }) => {
      setUser(user);
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile });
      toast.success('Profile updated');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update your profile')),
  });

  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  const changePassword = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => {
      passwordForm.reset();
      toast.success('Password updated');
    },
    onError: (error) =>
      passwordForm.setError('root', {
        message: getErrorMessage(error, 'Could not change your password'),
      }),
  });

  const shortcuts = [
    { to: '/account/orders', label: 'Orders', icon: Package, hint: 'Track and review past orders' },
    { to: '/account/addresses', label: 'Addresses', icon: MapPin, hint: 'Manage delivery addresses' },
    { to: '/wishlist', label: 'Wishlist', icon: Heart, hint: 'Pieces you have saved' },
  ];

  const isDirty = profileForm.formState.isDirty;

  return (
    <div className="acct-stagger space-y-6">
      <section aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading" className="sr-only">
          Account shortcuts
        </h2>
        <ul className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {shortcuts.map((shortcut) => (
            <li key={shortcut.to}>
              <Link
                to={shortcut.to}
                className="acct-card acct-card-hover group relative flex h-full flex-col items-center gap-2 overflow-hidden p-3 text-center sm:items-stretch sm:gap-3 sm:p-5 sm:text-left"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-opacity duration-500 group-hover:opacity-100 sm:opacity-60"
                />
                <span className="relative flex items-center justify-center sm:justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl sm:h-11 sm:w-11 bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-white">
                    <shortcut.icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <ArrowUpRight className="hidden h-4 w-4 text-ink-subtle sm:block transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                </span>
                <span className="relative">
                  <span className="block text-[0.625rem] font-bold uppercase tracking-wide sm:text-sm sm:tracking-wider">{shortcut.label}</span>
                  <span className="mt-1 hidden text-xs text-ink-muted sm:block">{shortcut.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <AccountCard
          title="Your details"
          description="How we address you and reach you about orders."
          icon={UserRound}
          headingId="details-heading"
        >
          <form
            onSubmit={profileForm.handleSubmit((values) =>
              updateProfile.mutate({ name: values.name, phone: values.phone }),
            )}
            noValidate
            className="space-y-5"
          >
            <Input
              label="Full name"
              autoComplete="name"
              required
              error={profileForm.formState.errors.name?.message}
              {...profileForm.register('name')}
            />

            <Input
              label="Email"
              type="email"
              value={profile?.email ?? ''}
              readOnly
              disabled
              hint="Contact support to change the email on your account"
            />

            <Input
              label="Phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel"
              error={profileForm.formState.errors.phone?.message}
              {...profileForm.register('phone')}
            />

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                type="submit"
                variant="primary"
                isLoading={updateProfile.isPending}
                disabled={!isDirty}
                className="shadow-[0_12px_26px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5"
              >
                Save changes
              </Button>
              {!isDirty && updateProfile.isSuccess && (
                <span className="inline-flex animate-fade-in items-center gap-1.5 text-xs font-medium text-success">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved
                </span>
              )}
            </div>
          </form>
        </AccountCard>

        <AccountCard
          title="Change password"
          description="Use at least 8 characters, with a letter and a number."
          icon={KeyRound}
          headingId="password-heading"
        >
          <form
            onSubmit={passwordForm.handleSubmit((values) =>
              changePassword.mutate({
                currentPassword: values.currentPassword,
                newPassword: values.newPassword,
              }),
            )}
            noValidate
            className="space-y-5"
          >
            {passwordForm.formState.errors.root && (
              <p role="alert" className="animate-fade-in rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
                {passwordForm.formState.errors.root.message}
              </p>
            )}

            <Input
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              required
              error={passwordForm.formState.errors.newPassword?.message}
              {...passwordForm.register('newPassword')}
            />

            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              error={passwordForm.formState.errors.confirmPassword?.message}
              {...passwordForm.register('confirmPassword')}
            />

            <Button type="submit" variant="outline" isLoading={changePassword.isPending} className="transition-all duration-300 hover:-translate-y-0.5">
              Update password
            </Button>
          </form>
        </AccountCard>
      </div>
    </div>
  );
}

export default ProfilePage;
