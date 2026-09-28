import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Save, Store, Phone, MapPin, Truck, Banknote, RotateCcw, ExternalLink, Undo2,
  Trash2, Plus,
} from 'lucide-react';

import { settingsApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P } from '@/permissions';
import { toast } from '@/store/toastStore';
import type { StoreSettings } from '@/types';
import { PageHeader, Button, Input, Skeleton, ErrorState } from '@/components/ui';
import { cn } from '@/utils/cn';

const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';

/**
 * Store settings — only what the storefront actually reads.
 *
 * Every field says where it shows up, and a save is live on the storefront
 * straight away (the shipping fee and COD rules are enforced by the server
 * at checkout, not just displayed).
 */

/** The editable shape. WhatsApp is edited as a number and saved as a wa.me link. */
interface Draft {
  storeName: string;
  contactEmail: string;
  phone: string;
  whatsappNumber: string;
  instagram: string;
  address: { line1: string; line2: string; city: string; state: string; postalCode: string };
  freeShippingThreshold: number;
  shippingFee: number;
  dispatchDays: number;
  deliveryEstimateDays: number;
  codEnabled: boolean;
  codMaxOrderValue: number;
  codCityOnly: boolean;
  codCity: string;
  codState: string;
  /** "530, 531" as typed. */
  codPinCheck: boolean;
  codPinAreas: { pin: string; area: string }[];
  returnDays: number;
}

/** "https://wa.me/919182948622" → "9182948622". */
const whatsappDigits = (link: string) => link.replace(/[^0-9]/g, '').slice(-10);

function toDraft(s: StoreSettings): Draft {
  return {
    storeName: s.storeName ?? '',
    contactEmail: s.contactEmail ?? '',
    phone: s.phone ?? '',
    whatsappNumber: whatsappDigits(s.whatsapp ?? ''),
    instagram: s.instagram ?? '',
    address: {
      line1: s.address?.line1 ?? '',
      line2: s.address?.line2 ?? '',
      city: s.address?.city ?? '',
      state: s.address?.state ?? '',
      postalCode: s.address?.postalCode ?? '',
    },
    freeShippingThreshold: s.shipping?.freeShippingThreshold ?? 999,
    shippingFee: s.shipping?.shippingFee ?? 79,
    dispatchDays: s.shipping?.dispatchDays ?? 2,
    deliveryEstimateDays: s.shipping?.deliveryEstimateDays ?? 6,
    codEnabled: s.shipping?.codEnabled ?? true,
    codMaxOrderValue: s.shipping?.codMaxOrderValue ?? 10000,
    codCityOnly: s.shipping?.codCityOnly ?? true,
    codCity: s.shipping?.codCity ?? 'Visakhapatnam',
    codState: s.shipping?.codState ?? 'Andhra Pradesh',
    codPinCheck: s.shipping?.codPinCheck ?? true,
    codPinAreas: (s.shipping?.codPinAreas ?? []).map(({ pin, area }) => ({ pin, area })),
    returnDays: s.returns?.windowDays ?? 7,
  };
}

/** Everything that would be wrong on the storefront, keyed by field. */
function validate(d: Draft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.storeName.trim()) errors.storeName = 'Enter the store name.';
  if (d.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.contactEmail)) errors.contactEmail = 'Enter a valid email address.';
  if (d.phone && d.phone.replace(/[^0-9]/g, '').length < 10) errors.phone = 'Enter a full phone number.';
  if (d.whatsappNumber && !/^[6-9][0-9]{9}$/.test(d.whatsappNumber)) errors.whatsappNumber = 'Enter a 10-digit mobile number.';
  if (d.instagram && !/^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/.test(d.instagram)) {
    errors.instagram = 'Use a link like https://instagram.com/humovare';
  }
  if (d.address.postalCode && !/^[0-9]{6}$/.test(d.address.postalCode)) errors.postalCode = 'PIN code is 6 digits.';
  if (d.shippingFee < 0) errors.shippingFee = 'Cannot be negative.';
  if (d.freeShippingThreshold < 0) errors.freeShippingThreshold = 'Cannot be negative.';
  if (d.deliveryEstimateDays < 1) errors.deliveryEstimateDays = 'At least 1 day.';
  if (d.dispatchDays < 0) errors.dispatchDays = 'Cannot be negative.';
  if (d.codMaxOrderValue < 0) errors.codMaxOrderValue = 'Cannot be negative.';
  if (d.codEnabled && d.codCityOnly && d.codCity.trim().length < 2) errors.codCity = 'Enter the city.';
  if (d.codEnabled && d.codCityOnly && d.codPinCheck) {
    const pins = d.codPinAreas.map((entry) => entry.pin.trim());
    if (!d.codPinAreas.length) errors.codPinAreas = 'Add at least one PIN code — or switch the PIN check off.';
    else if (pins.some((pin) => !/^\d{6}$/.test(pin))) errors.codPinAreas = 'Every PIN code must be 6 digits.';
    else if (new Set(pins).size !== pins.length) errors.codPinAreas = 'A PIN code is listed twice.';
    else if (d.codPinAreas.some((entry) => !entry.area.trim())) errors.codPinAreas = 'Give every PIN code an area name.';
  }
  if (d.returnDays < 0) errors.returnDays = 'Cannot be negative.';
  return errors;
}

const inr = (value: number) => `₹${Math.round(value || 0).toLocaleString('en-IN')}`;

/**
 * The PIN codes that get Cash on Delivery, each with its area name — exactly
 * what customers pick from at checkout. Add, rename or remove rows here.
 */
function PinAreaList({ city, value, onChange, error, disabled }: {
  city: string;
  value: { pin: string; area: string }[];
  onChange: (next: { pin: string; area: string }[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [area, setArea] = useState('');
  const [query, setQuery] = useState('');
  const duplicate = value.some((entry) => entry.pin === pin);
  const canAdd = /^\d{6}$/.test(pin) && area.trim().length > 0 && !duplicate;

  const add = () => {
    if (!canAdd) return;
    onChange([...value, { pin, area: area.trim() }].sort((a, b) => a.pin.localeCompare(b.pin)));
    setPin('');
    setArea('');
  };
  const shown = value
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => !query || entry.pin.includes(query) || entry.area.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="rounded-xl border border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">{city} PIN codes</p>
          <p className="text-xs text-ink-muted">
            {value.length} {value.length === 1 ? 'area' : 'areas'} · customers pick from this list, and only these get COD
          </p>
        </div>
        {value.length > 6 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a PIN or area…"
            aria-label="Find a PIN code"
            className="h-8 w-44 rounded-md border border-line bg-panel px-2.5 text-xs focus:border-primary focus:outline-none"
          />
        )}
      </div>

      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {shown.map((entry) => (
          <li key={entry.index} className="group flex items-center gap-3 px-4 py-2">
            <span className="tabular w-16 shrink-0 rounded-md bg-canvas px-2 py-1 text-center font-mono text-xs font-semibold text-ink">{entry.pin}</span>
            <input
              value={entry.area}
              onChange={(e) => onChange(value.map((row, i) => (i === entry.index ? { ...row, area: e.target.value } : row)))}
              aria-label={`Area for ${entry.pin}`}
              disabled={disabled}
              className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-ink hover:border-line focus:border-primary focus:outline-none"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== entry.index))}
                aria-label={`Remove ${entry.pin}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-subtle opacity-60 transition hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
        {!shown.length && <li className="px-4 py-6 text-center text-xs text-ink-subtle">No PIN codes {query ? 'match' : 'yet'}.</li>}
      </ul>

      {!disabled && (
        <div className="flex flex-wrap items-start gap-2 border-t border-line bg-canvas/60 px-4 py-3">
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="530xxx"
            inputMode="numeric"
            aria-label="New PIN code"
            className="tabular h-9 w-24 rounded-md border border-line bg-panel px-2.5 font-mono text-sm focus:border-primary focus:outline-none"
          />
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="Area name, e.g. MVP Colony"
            aria-label="New area name"
            className="h-9 min-w-0 flex-1 rounded-md border border-line bg-panel px-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <Button type="button" size="sm" onClick={add} disabled={!canAdd} className="h-9">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add
          </Button>
          {duplicate && <p className="w-full text-xs text-danger">{pin} is already on the list.</p>}
        </div>
      )}
      {error && <p className="border-t border-danger/20 bg-danger/5 px-4 py-2 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermission();
  const readOnly = !can(P.SETTINGS_UPDATE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.settings,
    // The page copies this into an editable draft; refetching on focus would
    // replace unsaved edits.
    refetchOnWindowFocus: false,
    queryFn: settingsApi.get,
  });

  const saved = useMemo(() => (data?.settings ? toDraft(data.settings) : null), [data]);
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const save = useMutation({
    mutationFn: (payload: unknown) => settingsApi.update(payload),
    onSuccess: () => {
      toast.success('Settings saved · live on the storefront');
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not save settings')),
  });

  if (isError) return <ErrorState title="Could not load settings" onRetry={() => refetch()} />;
  if (isLoading || !draft || !saved) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value });
  const setAddress = (key: keyof Draft['address'], value: string) =>
    setDraft({ ...draft, address: { ...draft.address, [key]: value } });
  const num = (value: string) => (value === '' ? 0 : Math.max(0, Number(value)));

  const handleSave = () => {
    if (hasErrors) {
      toast.error(Object.values(errors)[0]);
      return;
    }
    save.mutate({
      storeName: draft.storeName.trim(),
      contactEmail: draft.contactEmail.trim(),
      // One email is shown to customers; keep both fields in step.
      supportEmail: draft.contactEmail.trim(),
      phone: draft.phone.trim(),
      whatsapp: draft.whatsappNumber ? `https://wa.me/91${draft.whatsappNumber}` : '',
      instagram: draft.instagram.trim(),
      address: { ...draft.address, country: 'India' },
      shipping: {
        freeShippingThreshold: draft.freeShippingThreshold,
        shippingFee: draft.shippingFee,
        dispatchDays: draft.dispatchDays,
        deliveryEstimateDays: draft.deliveryEstimateDays,
        codEnabled: draft.codEnabled,
        codMaxOrderValue: draft.codMaxOrderValue,
        codCityOnly: draft.codCityOnly,
        codCity: draft.codCity.trim(),
        codState: draft.codState.trim(),
        codPinCheck: draft.codPinCheck,
        codPinAreas: draft.codPinAreas.map((entry) => ({ pin: entry.pin.trim(), area: entry.area.trim() })),
      },
      returns: { windowDays: draft.returnDays },
    });
  };

  return (
    <>
      <PageHeader
        title="Store settings"
        description="Contact details and shop rules. Saving updates the storefront straight away."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Settings' }]}
        actions={
          <>
            <a
              href={SITE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3.5 text-sm text-ink hover:bg-canvas"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View storefront
            </a>
            <Button onClick={handleSave} isLoading={save.isPending} disabled={readOnly || !isDirty}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {isDirty ? 'Save changes' : 'Saved'}
            </Button>
          </>
        }
      />

      <div className="stagger grid gap-4 xl:grid-cols-2">
        <Section
          icon={Store}
          title="Store"
          shownOn="Browser tab titles and the © line in the footer."
        >
          <Input
            label="Store name"
            value={draft.storeName}
            onChange={(e) => set('storeName', e.target.value)}
            error={errors.storeName}
            disabled={readOnly}
          />
        </Section>

        <Section
          icon={Phone}
          title="Contact"
          shownOn="Footer, Contact page, mobile menu and policy pages."
        >
          <Input
            label="Email"
            type="email"
            value={draft.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            error={errors.contactEmail}
            placeholder="hello@humovare.in"
            disabled={readOnly}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Phone"
              value={draft.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
              placeholder="+91 79893 55385"
              hint="Customers can tap to call."
              disabled={readOnly}
            />
            <PrefixedInput
              label="WhatsApp number"
              prefix="+91"
              value={draft.whatsappNumber}
              onChange={(value) => set('whatsappNumber', value.replace(/[^0-9]/g, '').slice(0, 10))}
              error={errors.whatsappNumber}
              placeholder="9182948622"
              hint="Opens a WhatsApp chat from the footer."
              disabled={readOnly}
            />
          </div>
          <Input
            label="Instagram link"
            value={draft.instagram}
            onChange={(e) => set('instagram', e.target.value)}
            error={errors.instagram}
            placeholder="https://instagram.com/humovare"
            disabled={readOnly}
          />
        </Section>

        <Section icon={MapPin} title="Address" shownOn="Footer and Contact page.">
          <Input label="Address line 1" value={draft.address.line1} onChange={(e) => setAddress('line1', e.target.value)} disabled={readOnly} />
          <Input label="Address line 2" value={draft.address.line2} onChange={(e) => setAddress('line2', e.target.value)} disabled={readOnly} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="City" value={draft.address.city} onChange={(e) => setAddress('city', e.target.value)} disabled={readOnly} />
            <Input label="State" value={draft.address.state} onChange={(e) => setAddress('state', e.target.value)} disabled={readOnly} />
            <Input
              label="PIN code"
              inputMode="numeric"
              value={draft.address.postalCode}
              onChange={(e) => setAddress('postalCode', e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              error={errors.postalCode}
              disabled={readOnly}
            />
          </div>
        </Section>

        <Section
          icon={Truck}
          title="Shipping"
          shownOn="Charged at checkout; shown in the bag, on product pages, the FAQ and the Shipping policy."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <PrefixedInput
              label="Shipping fee"
              prefix="₹"
              type="number"
              value={String(draft.shippingFee)}
              onChange={(value) => set('shippingFee', num(value))}
              error={errors.shippingFee}
              disabled={readOnly}
            />
            <PrefixedInput
              label="Free shipping on orders above"
              prefix="₹"
              type="number"
              value={String(draft.freeShippingThreshold)}
              onChange={(value) => set('freeShippingThreshold', num(value))}
              error={errors.freeShippingThreshold}
              disabled={readOnly}
            />
            <PrefixedInput
              label="Dispatch within"
              suffix="days"
              type="number"
              value={String(draft.dispatchDays)}
              onChange={(value) => set('dispatchDays', num(value))}
              error={errors.dispatchDays}
              disabled={readOnly}
            />
            <PrefixedInput
              label="Delivery within"
              suffix="days"
              type="number"
              value={String(draft.deliveryEstimateDays)}
              onChange={(value) => set('deliveryEstimateDays', num(value))}
              error={errors.deliveryEstimateDays}
              disabled={readOnly}
            />
          </div>
          <Preview>
            Orders below <strong>{inr(draft.freeShippingThreshold)}</strong> pay <strong>{inr(draft.shippingFee)}</strong> shipping;
            above that it is free. Dispatched within <strong>{draft.dispatchDays} day{draft.dispatchDays === 1 ? '' : 's'}</strong>,
            delivered within <strong>{draft.deliveryEstimateDays} days</strong>.
          </Preview>
        </Section>

        <Section
          icon={Banknote}
          title="Cash on Delivery"
          shownOn="The payment step at checkout and the Shipping policy."
        >
          <Toggle
            checked={draft.codEnabled}
            onChange={(value) => set('codEnabled', value)}
            label="Offer Cash on Delivery"
            description={draft.codEnabled ? 'Customers can choose to pay the courier.' : 'Checkout only offers online payment (PhonePe).'}
            disabled={readOnly}
          />
          {draft.codEnabled && (
            <>
              <PrefixedInput
                label="Only for orders up to"
                prefix="₹"
                type="number"
                value={String(draft.codMaxOrderValue)}
                onChange={(value) => set('codMaxOrderValue', num(value))}
                error={errors.codMaxOrderValue}
                hint="Set 0 for no limit. Bigger orders must be paid online."
                disabled={readOnly}
              />
              <Toggle
                checked={draft.codCityOnly}
                onChange={(value) => set('codCityOnly', value)}
                label={`Only for customers in ${draft.codCity.trim() || 'one city'}`}
                description={
                  draft.codCityOnly
                    ? 'Checkout offers COD only when the delivery address is in this city. Everyone else pays online.'
                    : 'COD is offered for every delivery address.'
                }
                disabled={readOnly}
              />
              {draft.codCityOnly && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="City"
                    value={draft.codCity}
                    onChange={(e) => set('codCity', e.target.value)}
                    error={errors.codCity}
                    placeholder="Visakhapatnam"
                    hint="Common spellings like “Vizag” also count."
                    disabled={readOnly}
                  />
                  <Input
                    label="State"
                    value={draft.codState}
                    onChange={(e) => set('codState', e.target.value)}
                    placeholder="Andhra Pradesh"
                    hint="Filled in for customers who pick this city."
                    disabled={readOnly}
                  />
                </div>
              )}
              {draft.codCityOnly && (
                <Toggle
                  checked={draft.codPinCheck}
                  onChange={(value) => set('codPinCheck', value)}
                  label="Also check the PIN code"
                  description={
                    draft.codPinCheck
                      ? 'COD needs the city AND a matching PIN, so typing the city name alone is not enough.'
                      : 'Only the city name is checked. Easier for customers, but anyone can type the city.'
                  }
                  disabled={readOnly}
                />
              )}
              {draft.codCityOnly && draft.codPinCheck && (
                <PinAreaList
                  city={draft.codCity.trim() || 'the city'}
                  value={draft.codPinAreas}
                  onChange={(next) => set('codPinAreas', next)}
                  error={errors.codPinAreas}
                  disabled={readOnly}
                />
              )}
            </>
          )}
          <Preview>
            {draft.codEnabled ? (
              <>
                Cash on Delivery is offered
                {draft.codCityOnly && draft.codCity.trim() ? <> only for deliveries in <strong>{draft.codCity.trim()}</strong></> : <> on every address</>}
                {draft.codMaxOrderValue > 0 ? <>, on orders up to <strong>{inr(draft.codMaxOrderValue)}</strong></> : null}.
                {draft.codCityOnly && draft.codCity.trim() ? <> Everywhere else pays online.</> : null}
              </>
            ) : (
              <>Cash on Delivery is <strong>off</strong> — every order is paid online.</>
            )}
          </Preview>
        </Section>

        <Section
          icon={RotateCcw}
          title="Returns"
          shownOn="Product pages, the FAQ, About page, trust strip and the Returns policy."
        >
          <PrefixedInput
            label="Return window"
            suffix="days after delivery"
            type="number"
            value={String(draft.returnDays)}
            onChange={(value) => set('returnDays', num(value))}
            error={errors.returnDays}
            disabled={readOnly}
          />
          <Preview>
            Customers see <strong>“{draft.returnDays}-day easy returns”</strong>.
          </Preview>
        </Section>
      </div>

      {isDirty && !readOnly && (
        <div className="sticky bottom-4 z-20 mt-4 animate-slide-up rounded-panel border border-primary/30 bg-panel/95 shadow-lift backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 px-4 py-3">
            <p className="text-sm text-ink">
              {hasErrors ? <span className="text-danger">{Object.values(errors)[0]}</span> : 'You have unsaved changes.'}
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(saved)}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} isLoading={save.isPending} disabled={hasErrors}>
                <Save className="h-4 w-4" aria-hidden="true" />
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ icon: Icon, title, shownOn, children }: {
  icon: typeof Store;
  title: string;
  shownOn: string;
  children: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line/80 px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">Shown on: {shownOn}</p>
        </div>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

/** A short sentence of what customers will actually read. */
function Preview({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted ring-1 ring-inset ring-line">
      <span className="mr-1.5 font-semibold uppercase tracking-wide text-ink-subtle">Preview</span>
      {children}
    </p>
  );
}

function PrefixedInput({ label, prefix, suffix, value, onChange, error, hint, placeholder, disabled, type = 'text' }: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'number';
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span
        className={cn(
          'flex h-9 items-center overflow-hidden rounded-md border bg-panel text-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
          error ? 'border-danger' : 'border-line',
          disabled && 'opacity-60',
        )}
      >
        {prefix && <span className="grid h-full place-items-center border-r border-line bg-canvas px-3 text-ink-muted">{prefix}</span>}
        <input
          type={type}
          min={type === 'number' ? 0 : undefined}
          inputMode={type === 'number' ? 'numeric' : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="tabular h-full min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-ink-subtle"
        />
        {suffix && <span className="whitespace-nowrap px-3 text-xs text-ink-subtle">{suffix}</span>}
      </span>
      {error ? (
        <span className="mt-1 block text-xs text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-ink-subtle">{hint}</span>
      )}
    </label>
  );
}

function Toggle({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 rounded-lg p-3 text-left ring-1 ring-inset ring-line transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-subtle">{description}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-success' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-smooth',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

export default SettingsPage;
