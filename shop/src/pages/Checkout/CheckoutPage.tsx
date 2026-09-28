import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Lock, Truck, Banknote, CreditCard, ArrowLeft, Loader2, Check, ShieldCheck, User, MapPin,
  Wallet, Plus, Smartphone, Landmark, RotateCcw,
} from 'lucide-react';

import { ordersApi, usersApi, getErrorMessage } from '@/api';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { useCart } from '@/hooks/useCart';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { formatPrice } from '@/utils/format';
import { cn } from '@/utils/cn';
import { goToPhonePe } from '@/utils/phonepe';
import { isCodAddress, cityPinError } from '@/utils/codArea';
import { INDIAN_STATES } from '@/constants';
import type { PaymentMethod } from '@/types';

import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/States';
import { CodCityPick } from '@/components/account/CodCityPick';

const addressSchema = z.object({
  name: z.string().trim().min(2, 'Enter the recipient name'),
  phone: z.string().regex(/^[0-9]{10}$/, 'Enter a valid 10-digit phone number'),
  // Plain email, not Gmail-restricted: this pre-fills from the signed-in
  // account, and an existing customer on another domain (or one who signed up
  // before that rule existed) must never be blocked from placing an order.
  email: z.string().trim().email('Enter a valid email').or(z.literal('')),
  addressLine1: z.string().trim().min(5, 'Enter the street address'),
  addressLine2: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.string().trim().min(2, 'Enter the state'),
  postalCode: z.string().regex(/^[0-9]{6}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().min(2),
  customerNote: z.string().trim().max(500).optional().or(z.literal('')),
  saveAddress: z.boolean().optional(),
});

type CheckoutForm = z.infer<typeof addressSchema>;

/**
 * With a saved address selected, the new-address fields are not on screen,
 * so they must not be validated — otherwise empty hidden fields fail and
 * "Place order" silently does nothing.
 */
const savedAddressSchema = addressSchema.pick({ phone: true, email: true, customerNote: true });
const fullResolver = zodResolver(addressSchema);
const savedResolver = zodResolver(savedAddressSchema) as unknown as Resolver<CheckoutForm>;

export function CheckoutPage() {
  useSeo({ title: 'Checkout', noindex: true });

  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { items, summary, isEmpty, isLoading } = useCart();

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  // null until the shopper picks: then PhonePe is the default when available.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  const { data: addressData } = useQuery({
    queryKey: queryKeys.user.addresses,
    queryFn: () => usersApi.listAddresses().then((res) => res.addresses),
  });

  const { data: methodData } = useQuery({
    queryKey: queryKeys.orders.paymentMethods,
    queryFn: () => ordersApi.paymentMethods().then((res) => res.methods),
    staleTime: 10 * 60 * 1000,
  });

  // Memoised so the fallback arrays keep a stable identity across renders.
  const addresses = useMemo(() => addressData ?? [], [addressData]);
  const methods = useMemo(() => methodData ?? [], [methodData]);

  // The resolver is fixed when the form is created; read the live choice.
  const usingSavedAddress = useRef(false);
  usingSavedAddress.current = selectedAddressId !== null;

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    watch,
    setError,
    formState: { errors },
  } = useForm<CheckoutForm>({
    resolver: (values, context, options) =>
      (usingSavedAddress.current ? savedResolver : fullResolver)(values, context, options),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      country: 'India',
      addressLine2: '',
      customerNote: '',
      saveAddress: true,
    },
  });

  // The account can arrive after the form mounts (session restore); fill the
  // contact fields then, without overwriting anything already typed.
  useEffect(() => {
    if (!user) return;
    if (!getValues('email')) setValue('email', user.email);
    if (!getValues('phone') && user.phone) setValue('phone', user.phone);
    if (!getValues('name')) setValue('name', user.name);
  }, [user, getValues, setValue]);

  // A saved address carries its own phone number; use it when the contact
  // phone is still empty, so the shopper is not asked for it twice.
  useEffect(() => {
    const chosen = addresses.find((address) => address._id === selectedAddressId);
    if (chosen?.phone && !getValues('phone')) {
      setValue('phone', chosen.phone, { shouldValidate: true });
    }
  }, [addresses, selectedAddressId, getValues, setValue]);

  // Pre-select the saved default address — once, when the addresses first
  // load. Running this on every change used to re-select it the moment the
  // shopper chose "Deliver to a new address", so that option never stuck.
  const addressPreselected = useRef(false);
  useEffect(() => {
    if (addressPreselected.current || !addresses.length) return;
    addressPreselected.current = true;
    setSelectedAddressId((addresses.find((address) => address.isDefault) ?? addresses[0])._id);
  }, [addresses]);

  const [redirecting, setRedirecting] = useState(false);
  // A second click while the first request is in flight must not create a
  // second order or payment. The server refuses it too; this stops it early.
  const submitting = useRef(false);

  const createOrder = useMutation({
    mutationFn: ordersApi.create,
    onSuccess: ({ order, payment, notifications }) => {
      // The order is placed whatever happened to the email. If the email did
      // not go out, say so plainly — the order page has everything it held.
      if (notifications?.email === 'failed' && notifications.message) {
        toast.info(notifications.message);
      }

      if (payment?.status === 'redirect') {
        // Off to PhonePe. Whatever happens there, the shopper comes back to
        // /payment/status, which asks the server what PhonePe confirmed.
        setRedirecting(true);
        if (goToPhonePe(payment.redirectUrl)) return;
        setRedirecting(false);
      }
      if (payment?.status === 'unavailable') toast.error(payment.message);

      if (order.paymentMethod === 'ONLINE') {
        navigate(`/payment/status?order=${order._id}`, { replace: true });
        return;
      }
      navigate(`/order-success/${order._id}`, { replace: true });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'We could not place your order')),
    onSettled: () => {
      submitting.current = false;
    },
  });

  const onlineMethod = useMemo(
    () => methods.find((method) => method.method === 'ONLINE'),
    [methods],
  );

  const onlineAvailable = Boolean(onlineMethod?.enabled);
  const total = summary?.total ?? 0;

  // Cash on delivery follows the store settings: it can be switched off, and
  // capped at an order value. The server enforces the same rule.
  // It can also be limited to one city (Visakhapatnam): judged on the saved
  // address picked, or on what is typed into the new-address form.
  const codMethod = methods.find((option) => option.method === 'COD');
  const codLimit = codMethod?.maxOrderValue ?? null;
  const codArea = codMethod?.area ?? null;
  const typedCity = watch('city');
  const typedState = watch('state');
  const typedPin = watch('postalCode');
  const deliveryAddress = selectedAddressId
    ? addresses.find((address) => address._id === selectedAddressId)
    : { city: typedCity, state: typedState, postalCode: typedPin };
  const codAreaOk = isCodAddress(deliveryAddress, codArea);
  const codBlocked = !methods.length
    ? null
    : !codMethod?.enabled
      ? 'Cash on Delivery is not available right now.'
      : !codAreaOk && codArea
        ? isCodAddress(deliveryAddress, codArea, { checkPin: false })
          ? `PIN ${deliveryAddress?.postalCode || '—'} is not on our ${codArea.city} COD list. Edit the address and pick your area, or pay online.`
          : `Only for deliveries in ${codArea.city}. Please pay online.`
        : codLimit && total > codLimit
          ? `Available on orders up to ${formatPrice(codLimit)}.`
          : null;

  // "I'm in Visakhapatnam" fills the city and state in one tap; unticking clears them.
  const pickCodCity = (checked: boolean) => {
    if (!codArea) return;
    setValue('city', checked ? codArea.city : '', { shouldValidate: checked, shouldDirty: true });
    setValue('state', checked ? codArea.state : '', { shouldValidate: checked, shouldDirty: true });
    // A PIN that is not one of the city's areas is cleared, so one is picked.
    if (checked && !codArea.pinAreas?.some((a) => a.pin === getValues('postalCode'))) setValue('postalCode', '');
  };
  // In the COD city the PIN is chosen from its list of areas.
  const inCodCity = Boolean(codArea) && isCodAddress({ city: typedCity, state: typedState }, codArea, { checkPin: false });
  const pinChoices = inCodCity ? codArea?.pinAreas ?? [] : [];
  const stateOptions =
    codArea?.state && !INDIAN_STATES.includes(codArea.state) ? [codArea.state, ...INDIAN_STATES] : INDIAN_STATES;

  // PhonePe first: it is the default whenever this server can take it. A
  // choice the shopper makes themselves always wins — unless it is no longer
  // allowed, in which case it falls back to what is.
  const preferred: PaymentMethod = onlineAvailable ? 'ONLINE' : 'COD';
  const method: PaymentMethod =
    paymentMethod === 'COD' && codBlocked ? preferred : paymentMethod ?? preferred;
  const payLabel = method === 'ONLINE'
    ? `Pay ${formatPrice(total)} securely with PhonePe`
    : `Place order · Pay ${formatPrice(total)} on delivery`;
  const PayIcon = method === 'ONLINE' ? Lock : Banknote;

  const onSubmit = (values: CheckoutForm) => {
    if (submitting.current || redirecting) return;

    // A new address that says Visakhapatnam must carry a Visakhapatnam PIN.
    if (!selectedAddressId) {
      const pinError = cityPinError(values, codArea);
      if (pinError) {
        setError('postalCode', { message: pinError });
        toast.error(pinError);
        document.querySelector('[name="postalCode"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    submitting.current = true;

    if (selectedAddressId) {
      createOrder.mutate({
        addressId: selectedAddressId,
        paymentMethod: method,
        customerNote: values.customerNote || undefined,
      });
      return;
    }

    createOrder.mutate({
      shippingAddress: {
        name: values.name,
        phone: values.phone,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2 || '',
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
      },
      paymentMethod: method,
      customerNote: values.customerNote || undefined,
      saveAddress: values.saveAddress ?? true,
    });
  };

  // Never fail silently: say what needs fixing, and bring it into view.
  const onInvalid = (formErrors: FieldErrors<CheckoutForm>) => {
    const first = Object.keys(formErrors)[0];
    toast.error('Please check the highlighted details before placing your order');
    if (first) {
      document
        .querySelector(`[name="${first}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (!isLoading && isEmpty) {
    return (
      <EmptyState
        title="Your bag is empty"
        description="Add something before heading to checkout."
        action={{ label: 'Shop the collection', to: '/shop' }}
      />
    );
  }

  return (
    <div className="acct-scope bg-surface/40 pb-28 lg:pb-16">
      <div className="container-page py-6 md:py-12">
        {redirecting && (
          <div
            role="status"
            aria-live="assertive"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-canvas/95 px-6 text-center backdrop-blur-sm"
          >
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary/10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            </span>
            <p className="text-lg font-semibold">Redirecting to PhonePe…</p>
            <p className="max-w-xs text-sm text-ink-muted">
              You will complete the payment on PhonePe's secure page. Please do not close or refresh this window.
            </p>
          </div>
        )}

        {/* Header + progress */}
        <div className="mb-6 flex animate-fade-up flex-wrap items-end justify-between gap-4 md:mb-8">
          <div>
            <h1 className="text-display-sm uppercase">Checkout</h1>
            <ol className="mt-3 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-wider sm:text-xs">
              <li className="flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-success">
                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Bag
              </li>
              <li aria-hidden="true" className="h-0.5 w-4 rounded-full bg-primary/40 sm:w-6" />
              <li className="rounded-full bg-primary px-2.5 py-1 text-white">Details</li>
              <li aria-hidden="true" className="h-0.5 w-4 rounded-full bg-line sm:w-6" />
              <li className="rounded-full border border-line bg-canvas px-2.5 py-1 text-ink-muted">Payment</li>
            </ol>
          </div>
          <p className="hidden items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted sm:flex">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
            Secure checkout · 256-bit encrypted
          </p>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-10"
          noValidate
        >
          <div className="acct-stagger space-y-4 sm:space-y-6">
            {/* 1 · Contact */}
            <StepCard step={1} icon={User} title="Contact" id="contact-heading">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
                <Input label="Phone" type="tel" inputMode="numeric" maxLength={10} autoComplete="tel" required error={errors.phone?.message} {...register('phone')} />
              </div>
            </StepCard>

            {/* 2 · Delivery */}
            <StepCard step={2} icon={MapPin} title="Delivery address" id="shipping-heading">
              {addresses.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {addresses.map((address) => {
                    const active = selectedAddressId === address._id;
                    return (
                      <li key={address._id}>
                        <label
                          className={cn(
                            'relative flex h-full cursor-pointer gap-3 rounded-2xl border p-4 transition-all duration-300',
                            active
                              ? 'border-primary bg-primary/[0.04] shadow-[0_12px_28px_-18px_rgb(var(--color-primary)/0.7)] ring-1 ring-primary'
                              : 'border-line bg-canvas hover:-translate-y-0.5 hover:border-ink-muted hover:shadow-md',
                          )}
                        >
                          <input
                            type="radio"
                            name="savedAddress"
                            checked={active}
                            onChange={() => setSelectedAddressId(address._id)}
                            className="mt-1 h-4 w-4 accent-[rgb(var(--color-primary))]"
                          />
                          <span className="text-sm">
                            <span className="flex flex-wrap items-center gap-2 font-medium">
                              {address.name}
                              {address.isDefault && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-primary">
                                  Default
                                </span>
                              )}
                              {codArea && codMethod?.enabled && isCodAddress(address, codArea) && (
                                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-success">
                                  COD available
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block leading-relaxed text-ink-muted">
                              {address.addressLine1}
                              {address.addressLine2 ? `, ${address.addressLine2}` : ''}, {address.city},{' '}
                              {address.state} {address.postalCode}
                            </span>
                            <span className="mt-1 block text-ink-muted">{address.phone}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}

                  <li>
                    <button
                      type="button"
                      onClick={() => setSelectedAddressId(null)}
                      aria-pressed={selectedAddressId === null}
                      className={cn(
                        'acct-raw group flex h-full min-h-[5.5rem] w-full items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-4 text-sm transition-all duration-300',
                        selectedAddressId === null
                          ? 'border-primary bg-primary/[0.04] font-semibold text-primary'
                          : 'border-line text-ink-muted hover:border-primary/50 hover:text-primary',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-8 w-8 place-items-center rounded-xl transition-all duration-300 group-hover:scale-110',
                          selectedAddressId === null ? 'bg-primary text-white' : 'bg-surface',
                        )}
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      </span>
                      Deliver to a new address
                    </button>
                  </li>
                </ul>
              )}

              {selectedAddressId === null && (
                <div className={cn('grid animate-fade-up gap-4 sm:grid-cols-2', addresses.length > 0 && 'mt-5 border-t border-line pt-5')}>
                  {codArea && codMethod?.enabled && (
                    <CodCityPick
                      area={codArea}
                      checked={isCodAddress({ city: typedCity, state: typedState }, codArea, { checkPin: false })}
                      onChange={pickCodCity}
                      postalCode={typedPin}
                      className="sm:col-span-2"
                    />
                  )}
                  <Input label="Full name" autoComplete="name" required error={errors.name?.message} containerClassName="sm:col-span-2" {...register('name')} />
                  <Input label="Address line 1" autoComplete="address-line1" required error={errors.addressLine1?.message} containerClassName="sm:col-span-2" {...register('addressLine1')} />
                  <Input label="Address line 2" autoComplete="address-line2" containerClassName="sm:col-span-2" {...register('addressLine2')} />
                  <Input label="City" autoComplete="address-level2" required error={errors.city?.message} {...register('city')} />

                  <Select label="State" required error={errors.state?.message} {...register('state')}>
                    <option value="">Select a state</option>
                    {stateOptions.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </Select>

                  {pinChoices.length ? (
                    <Select label="Area & PIN code" required error={errors.postalCode?.message} {...register('postalCode')}>
                      <option value="">Select your area</option>
                      {pinChoices.map((choice) => (
                        <option key={choice.pin} value={choice.pin}>
                          {choice.pin} — {choice.area}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input label="PIN code" inputMode="numeric" maxLength={6} autoComplete="postal-code" required error={errors.postalCode?.message} {...register('postalCode')} />
                  )}
                  <Input label="Country" readOnly {...register('country')} />

                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--color-primary))]" {...register('saveAddress')} />
                    Save this address for next time
                  </label>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-sm">
                <Truck className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
                <span className="flex-1">
                  <span className="font-medium">Standard delivery</span>
                  <span className="text-ink-muted"> · 3–6 working days</span>
                </span>
                <span className={cn('font-medium', !summary?.shippingFee && 'text-success')}>
                  {summary?.shippingFee ? formatPrice(summary.shippingFee) : 'Free'}
                </span>
              </div>
            </StepCard>

            {/* 3 · Payment — PhonePe first */}
            <StepCard step={3} icon={Wallet} title="Payment" id="payment-heading">
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="payment-heading">
                {/* PhonePe */}
                <label
                  className={cn(
                    'group relative flex h-full flex-col rounded-2xl border-2 p-4 transition-all duration-300 sm:p-5',
                    !onlineAvailable
                      ? 'cursor-not-allowed border-line bg-canvas opacity-60'
                      : method === 'ONLINE'
                        ? 'cursor-pointer border-primary bg-primary/[0.03] shadow-[0_14px_30px_-18px_rgb(var(--color-primary)/0.6)]'
                        : 'cursor-pointer border-line bg-canvas hover:-translate-y-0.5 hover:border-ink-muted hover:shadow-md',
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={method === 'ONLINE'}
                    disabled={!onlineAvailable}
                    onChange={() => setPaymentMethod('ONLINE')}
                    className="acct-raw peer sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#5f259f] text-white shadow-[0_8px_18px_-10px_#5f259f]" aria-hidden="true">
                      <Smartphone className="h-5 w-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-full border-2 transition-all duration-300 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
                        method === 'ONLINE' ? 'scale-110 border-primary bg-primary text-white' : 'border-line bg-canvas text-transparent',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </span>
                  <span className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">Pay online</span>
                    {onlineAvailable && (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-success">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    {onlineAvailable ? 'UPI, cards or net banking via PhonePe' : 'Not available right now — please choose Cash on Delivery.'}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {[
                      { icon: Smartphone, label: 'UPI' },
                      { icon: CreditCard, label: 'Cards' },
                      { icon: Landmark, label: 'Net banking' },
                    ].map(({ icon: Icon, label }) => (
                      <span key={label} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[0.6875rem] font-medium text-ink-muted">
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {label}
                      </span>
                    ))}
                  </span>
                </label>

                {/* Cash on Delivery */}
                <label
                  className={cn(
                    'group relative flex h-full flex-col rounded-2xl border-2 p-4 transition-all duration-300 sm:p-5',
                    codBlocked
                      ? 'cursor-not-allowed border-line bg-canvas opacity-60'
                      : method === 'COD'
                        ? 'cursor-pointer border-primary bg-primary/[0.03] shadow-[0_14px_30px_-18px_rgb(var(--color-primary)/0.6)]'
                        : 'cursor-pointer border-line bg-canvas hover:-translate-y-0.5 hover:border-ink-muted hover:shadow-md',
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={method === 'COD'}
                    onChange={() => setPaymentMethod('COD')}
                    disabled={Boolean(codBlocked)}
                    className="acct-raw peer sr-only"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-black text-white" aria-hidden="true">
                      <Banknote className="h-5 w-5" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        'grid h-6 w-6 place-items-center rounded-full border-2 transition-all duration-300 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
                        method === 'COD' ? 'scale-110 border-primary bg-primary text-white' : 'border-line bg-canvas text-transparent',
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  </span>
                  <span className="mt-4 block text-base font-semibold">Cash on Delivery</span>
                  <span className="mt-1 block text-sm text-ink-muted">
                    {codBlocked ?? 'Pay in cash when your order arrives'}
                  </span>
                  <span className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[0.6875rem] font-medium text-ink-muted">
                      <Truck className="h-3 w-3" aria-hidden="true" />
                      Pay at your door
                    </span>
                  </span>
                </label>
              </div>

              {/* What happens next, for the method picked. */}
              <div key={method} className="mt-4 flex animate-fade-up items-start gap-3 rounded-2xl bg-surface px-4 py-3.5 text-sm">
                {method === 'ONLINE' ? (
                  <>
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    <p className="text-ink-muted">
                      <span className="font-semibold text-ink">Secure payment.</span> You&apos;ll pay {formatPrice(total)} on PhonePe&apos;s
                      encrypted page, and your order is confirmed the moment the payment goes through.
                    </p>
                  </>
                ) : (
                  <>
                    <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-ink" aria-hidden="true" />
                    <p className="text-ink-muted">
                      <span className="font-semibold text-ink">Nothing to pay now.</span> Keep {formatPrice(total)} ready and pay the
                      delivery partner when your order arrives.
                    </p>
                  </>
                )}
              </div>

              <Textarea
                label="Order note (optional)"
                placeholder="Delivery instructions, a gift message…"
                containerClassName="mt-5"
                error={errors.customerNote?.message}
                {...register('customerNote')}
              />
            </StepCard>
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-8 lg:h-fit">
            <div className="acct-card animate-fade-up overflow-hidden" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider">Order summary</h2>
                <span className="text-xs text-ink-muted">
                  {items.reduce((sum, line) => sum + line.quantity, 0)} item{items.reduce((sum, line) => sum + line.quantity, 0) === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="max-h-72 space-y-4 overflow-y-auto px-5 py-4">
                {items.map((line) => (
                  <li key={line.id} className="flex gap-3">
                    <span className="relative shrink-0">
                      {line.image ? (
                        <img src={line.image} alt="" loading="lazy" className="h-20 w-16 rounded-xl bg-surface object-cover" />
                      ) : (
                        <span className="block h-20 w-16 rounded-xl bg-surface" />
                      )}
                      <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-ink-black px-1 text-[0.625rem] font-semibold text-white">
                        {line.quantity}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block truncate font-medium">{line.name}</span>
                      <span className="block text-xs text-ink-muted">{line.color} · {line.size}</span>
                    </span>
                    <span className="text-sm font-medium">{formatPrice(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <dl className="space-y-2 border-t border-line px-5 py-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd>{formatPrice(summary?.subtotal ?? 0)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className={cn(!summary?.shippingFee && 'text-success')}>
                    {summary?.shippingFee ? formatPrice(summary.shippingFee) : 'Free'}
                  </dd>
                </div>
              </dl>

              <div className="flex items-baseline justify-between bg-surface px-5 py-4">
                <span className="text-sm font-semibold">You pay</span>
                <span className="text-2xl font-bold tracking-tight">{formatPrice(total)}</span>
              </div>

              <div className="px-5 pb-5 pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="auth-shine hidden h-12 rounded-xl shadow-[0_14px_30px_-12px_rgb(var(--color-primary)/0.7)] transition-all duration-300 hover:-translate-y-0.5 lg:inline-flex"
                  isLoading={createOrder.isPending || redirecting}
                  disabled={createOrder.isPending || redirecting}
                >
                  <PayIcon className="h-4 w-4" aria-hidden="true" />
                  {payLabel}
                </Button>

                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
                  <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  {method === 'ONLINE' ? 'Encrypted & secured by PhonePe' : 'No payment now — pay when it arrives'}
                </p>

                <ul className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center text-[0.6875rem] text-ink-muted">
                  <li className="flex flex-col items-center gap-1"><Lock className="h-4 w-4" aria-hidden="true" />Secure</li>
                  <li className="flex flex-col items-center gap-1"><Truck className="h-4 w-4" aria-hidden="true" />Tracked delivery</li>
                  <li className="flex flex-col items-center gap-1"><RotateCcw className="h-4 w-4" aria-hidden="true" />Easy returns</li>
                </ul>

                <p className="mt-4 text-center text-[0.625rem] text-ink-subtle">
                  By placing this order you agree to our terms and privacy policy.
                </p>

                <button
                  type="button"
                  onClick={() => navigate('/cart')}
                  className="mt-3 flex w-full items-center justify-center gap-2 text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Back to bag
                </button>
              </div>
            </div>
          </aside>

          {/* Phones: the total and the button stay in reach. */}
          <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-line bg-canvas/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_30px_-18px_rgba(0,0,0,0.35)] backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-xl items-center gap-4">
              <span className="shrink-0">
                <span className="block text-[0.625rem] uppercase tracking-wider text-ink-muted">You pay</span>
                <span className="block text-lg font-bold">{formatPrice(total)}</span>
              </span>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                className="auth-shine rounded-xl"
                isLoading={createOrder.isPending || redirecting}
                disabled={createOrder.isPending || redirecting}
              >
                <PayIcon className="h-4 w-4" aria-hidden="true" />
                {method === 'ONLINE' ? 'Pay with PhonePe' : 'Place order · Pay on delivery'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function StepCard({
  step,
  icon: Icon,
  title,
  id,
  children,
}: {
  step: number;
  icon: typeof User;
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="acct-card p-4 sm:p-6">
      <h2 id={id} className="mb-5 flex items-center gap-3 text-sm font-bold uppercase tracking-wider sm:text-base">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-sm font-bold text-white shadow-[0_8px_18px_-8px_rgb(var(--color-primary)/0.8)]">
          {step}
        </span>
        <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export default CheckoutPage;
