import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Trash2, Plus, Home, Briefcase, Phone, Star } from 'lucide-react';

import { usersApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { isCodAddress, cityPinError } from '@/utils/codArea';
import { INDIAN_STATES } from '@/constants';
import { toast } from '@/store/toastStore';
import { cn } from '@/utils/cn';
import type { Address } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/States';
import { CodCityPick } from '@/components/account/CodCityPick';

const schema = z.object({
  label: z.enum(['home', 'work', 'other']),
  name: z.string().trim().min(2, 'Enter the recipient name'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number'),
  addressLine1: z.string().trim().min(5, 'Enter the street address'),
  addressLine2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Enter the state'),
  postalCode: z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().min(2),
  isDefault: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

const LABEL_ICON = { home: Home, work: Briefcase, other: MapPin } as const;

const EMPTY: FormValues = {
  label: 'home',
  name: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'India',
  isDefault: false,
};

export function AddressesPage() {
  useSeo({ title: 'Your addresses', noindex: true });

  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Address | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.user.addresses,
    queryFn: () => usersApi.listAddresses().then((res) => res.addresses),
  });

  const addresses = data ?? [];

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  // Cash on Delivery may be limited to one city; offer it as a one-tap pick.
  const { cod } = useStoreSettings();
  const codArea = cod.enabled ? cod.area ?? null : null;
  const typedCity = form.watch('city');
  const typedState = form.watch('state');
  const typedPin = form.watch('postalCode');
  const pickCodCity = (checked: boolean) => {
    if (!codArea) return;
    form.setValue('city', checked ? codArea.city : '', { shouldValidate: checked, shouldDirty: true });
    form.setValue('state', checked ? codArea.state : '', { shouldValidate: checked, shouldDirty: true });
    if (checked && !codArea.pinAreas?.some((a) => a.pin === form.getValues('postalCode'))) form.setValue('postalCode', '');
  };
  const inCodCity = Boolean(codArea) && isCodAddress({ city: typedCity, state: typedState }, codArea, { checkPin: false });
  const pinChoices = inCodCity ? codArea?.pinAreas ?? [] : [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.user.addresses });
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile });
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    form.reset(EMPTY);
  };

  const saveAddress = useMutation({
    mutationFn: (values: FormValues) =>
      editing ? usersApi.updateAddress(editing._id, values) : usersApi.createAddress(values),
    onSuccess: () => {
      refresh();
      toast.success(editing ? 'Address updated' : 'Address saved');
      closeForm();
    },
    onError: (error) =>
      form.setError('root', { message: getErrorMessage(error, 'Could not save this address') }),
  });

  const deleteAddress = useMutation({
    mutationFn: usersApi.deleteAddress,
    onSuccess: () => {
      refresh();
      toast.info('Address removed');
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not remove that address')),
  });

  const openNew = () => {
    setEditing(null);
    // The first saved address becomes the default automatically.
    form.reset({ ...EMPTY, isDefault: addresses.length === 0 });
    setIsFormOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditing(address);
    form.reset({
      label: address.label,
      name: address.name,
      phone: address.phone,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? '',
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
    });
    setIsFormOpen(true);
  };

  if (isLoading) return <ListSkeleton rows={2} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wider">Saved addresses</h2>
          <p className="mt-1 text-sm text-ink-muted">Pick one at checkout in a single tap.</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={openNew}
          className="shadow-[0_10px_24px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Add new
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="acct-card">
          <EmptyState
            icon={MapPin}
            title="No addresses saved"
            description="Add one now and checkout gets a lot quicker next time."
            className="py-14"
          />
        </div>
      ) : (
        <ul className="acct-stagger grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => {
            const LabelIcon = LABEL_ICON[address.label] ?? MapPin;
            return (
              <li
                key={address._id}
                className={cn(
                  'acct-card acct-card-hover group relative flex flex-col overflow-hidden p-5 sm:p-6',
                  address.isDefault && 'border-primary/40 ring-1 ring-primary/20',
                )}
              >
                {address.isDefault && (
                  <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
                )}

                <div className="relative mb-4 flex items-center gap-3">
                  <span
                    className={cn(
                      'grid h-10 w-10 place-items-center rounded-xl transition-colors duration-300',
                      address.isDefault ? 'bg-primary text-white' : 'bg-surface text-ink-muted group-hover:bg-primary/10 group-hover:text-primary',
                    )}
                  >
                    <LabelIcon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink">{address.label}</span>
                  {address.isDefault && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-primary">
                      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                      Default
                    </span>
                  )}
                </div>

                <address className="relative flex-1 text-sm not-italic leading-relaxed text-ink-muted">
                  <span className="block font-semibold text-ink">{address.name}</span>
                  {address.addressLine1}
                  {address.addressLine2 && <>, {address.addressLine2}</>}
                  <br />
                  {address.city}, {address.state} {address.postalCode}
                  {codArea && isCodAddress(address, codArea) && (
                    <span className="mt-2 inline-flex rounded-full bg-success/10 px-2.5 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-success">
                      COD available
                    </span>
                  )}
                  <span className="mt-2 flex items-center gap-1.5 text-xs">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {address.phone}
                  </span>
                </address>

                <div className="relative mt-5 flex gap-2 border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 border border-line py-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted transition-all duration-300 hover:border-ink-muted hover:text-ink"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteAddress.mutate(address._id)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 border border-line py-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-muted transition-all duration-300 hover:border-danger/40 hover:bg-danger/5 hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Remove
                  </button>
                </div>
              </li>
            );
          })}

          <li>
            <button
              type="button"
              onClick={openNew}
              className="acct-raw group flex h-full min-h-[14rem] w-full flex-col items-center justify-center gap-3 rounded-[1.25rem] border-2 border-dashed border-line text-ink-muted transition-all duration-300 hover:border-primary/50 hover:bg-primary/[0.03] hover:text-primary"
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-white">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">Add a new address</span>
            </button>
          </li>
        </ul>
      )}

      <Modal
        isOpen={isFormOpen}
        onClose={closeForm}
        position="center"
        size="lg"
        title={editing ? 'Edit address' : 'Add address'}
      >
        <form
          onSubmit={form.handleSubmit((values) => {
            // City and PIN must agree before the address is saved.
            const pinError = cityPinError(values, cod.area);
            if (pinError) {
              form.setError('postalCode', { message: pinError });
              return;
            }
            saveAddress.mutate(values);
          })}
          noValidate
          className="acct-scope space-y-4 p-5"
        >
          {form.formState.errors.root && (
            <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {form.formState.errors.root.message}
            </p>
          )}

          {codArea && (
            <CodCityPick
              area={codArea}
              checked={isCodAddress({ city: typedCity, state: typedState }, codArea, { checkPin: false })}
              onChange={pickCodCity}
              postalCode={typedPin}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Label" {...form.register('label')}>
              <option value="home">Home</option>
              <option value="work">Work</option>
              <option value="other">Other</option>
            </Select>

            <Input
              label="Recipient name"
              autoComplete="name"
              required
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />

            <Input
              label="Phone"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              required
              error={form.formState.errors.phone?.message}
              {...form.register('phone')}
            />

            {pinChoices.length ? (
              <Select label="Area & PIN code" required error={form.formState.errors.postalCode?.message} {...form.register('postalCode')}>
                <option value="">Select your area</option>
                {pinChoices.map((choice) => (
                  <option key={choice.pin} value={choice.pin}>
                    {choice.pin} — {choice.area}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                label="PIN code"
                inputMode="numeric"
                maxLength={6}
                required
                error={form.formState.errors.postalCode?.message}
                {...form.register('postalCode')}
              />
            )}

            <Input
              label="Address line 1"
              required
              containerClassName="sm:col-span-2"
              error={form.formState.errors.addressLine1?.message}
              {...form.register('addressLine1')}
            />

            <Input
              label="Address line 2"
              containerClassName="sm:col-span-2"
              {...form.register('addressLine2')}
            />

            <Input
              label="City"
              required
              error={form.formState.errors.city?.message}
              {...form.register('city')}
            />

            <Select label="State" required error={form.formState.errors.state?.message} {...form.register('state')}>
              <option value="">Select a state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>

            <Input label="Country" readOnly {...form.register('country')} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--color-primary))]"
              {...form.register('isDefault')}
            />
            Make this my default address
          </label>

          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="primary" isLoading={saveAddress.isPending}>
              {editing ? 'Save changes' : 'Save address'}
            </Button>
            <Button type="button" variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default AddressesPage;
