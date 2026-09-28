import { Banknote, Check, MapPin } from 'lucide-react';

import type { CodArea } from '@/types';
import { cn } from '@/utils/cn';

interface CodCityPickProps {
  area: CodArea;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The PIN typed so far — COD also needs it to be in the area. */
  postalCode?: string;
  className?: string;
}

/**
 * "I'm in Visakhapatnam" — one tap fills in the city and state. Shown first
 * in the address form, because only deliveries there can pay cash.
 */
export function CodCityPick({ area, checked, onChange, postalCode, className }: CodCityPickProps) {
  const prefixes = area.pinPrefixes ?? [];
  const pin = (postalCode ?? '').replace(/\D/g, '');
  const pinKnown = pin.length === 6;
  const pinOk = !prefixes.length || prefixes.some((prefix) => pin.startsWith(prefix));
  const hasList = Boolean(area.pinAreas?.length);
  const pinHint = hasList ? '' : prefixes.map((p) => `${p}xxx`).join(' or ');

  return (
    <label
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 transition-all duration-300',
        checked
          ? 'border-primary bg-primary/[0.04] shadow-[0_12px_28px_-18px_rgb(var(--color-primary)/0.7)]'
          : 'border-dashed border-line bg-canvas hover:border-primary/50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="acct-raw peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all duration-300 group-hover:scale-105',
          checked ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
        )}
      >
        <MapPin className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold">I&apos;m in {area.city}</span>
        <span className="mt-0.5 block text-ink-muted">
          {checked
            ? `City and state filled in: ${area.city}${area.state ? `, ${area.state}` : ''}.`
            : `Cash on Delivery is only available in ${area.city}. Tick this to fill in your city${area.state ? ' and state' : ''}.`}
        </span>
        {checked && (!pinKnown || pinOk) && (
          <span className="mt-2 inline-flex animate-fade-up items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[0.6875rem] font-semibold text-success">
            <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
            {pinKnown ? 'Cash on Delivery available' : hasList ? 'Now choose your area below' : `Cash on Delivery available with a PIN starting ${pinHint}`}
          </span>
        )}
        {checked && pinKnown && !pinOk && (
          <span className="mt-2 block animate-fade-up rounded-xl bg-warning/10 px-3 py-2 text-[0.75rem] font-medium text-warning">
            {hasList
              ? `PIN ${pin} is not on the ${area.city} list — choose your area below.`
              : `PIN ${pin} is not a ${area.city} PIN. Cash on Delivery needs a PIN starting ${pinHint}.`}
          </span>
        )}
      </span>

      <span
        aria-hidden="true"
        className={cn(
          'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-all duration-300 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
          checked ? 'scale-110 border-primary bg-primary text-white' : 'border-line bg-canvas text-transparent',
        )}
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    </label>
  );
}

export default CodCityPick;
