import type { CodArea } from '@/types';

// Spellings people actually type for the default COD city. Kept in step with
// server/src/services/storeSettings.service.js — the server decides; this only
// lets checkout show the right option before the order is sent.
const CITY_ALIASES: Record<string, string[]> = {
  visakhapatnam: ['vishakhapatnam', 'visakapatnam', 'vishakapatnam', 'visakhapatanam', 'vizag', 'vishakha', 'vskp', 'waltair'],
};

const normalise = (value?: string | null) => String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');

/** How to describe the PINs that count. */
export function pinRule(area: CodArea) {
  return area.pinAreas?.length
    ? `Choose your area from the list.`
    : `${area.city} PINs start with ${(area.pinPrefixes ?? []).join(' or ')}.`;
}

/**
 * An address that says it is in the COD city must use that city's PIN codes.
 * Returns the message for the PIN field, or null.
 */
export function cityPinError(address: { city?: string; postalCode?: string }, area: CodArea | null | undefined) {
  const prefixes = area?.pinPrefixes ?? [];
  if (!area || !prefixes.length) return null;
  if (!isCodAddress({ city: address.city, state: '' }, { ...area, state: '' }, { checkPin: false })) return null;
  const pin = String(address.postalCode ?? '').replace(/\D/g, '');
  if (prefixes.some((prefix) => pin.startsWith(prefix))) return null;
  return `${pin || 'This'} is not a ${area.city} PIN code we deliver Cash on Delivery to. ${pinRule(area)}`;
}

/** Whether an address may use Cash on Delivery. No area = any address. */
export function isCodAddress(
  address: { city?: string; state?: string; postalCode?: string } | null | undefined,
  area: CodArea | null | undefined,
  { checkPin = true }: { checkPin?: boolean } = {},
) {
  if (!area) return true;
  const want = normalise(area.city);
  const city = normalise(address?.city);
  const cityOk = city === want || (CITY_ALIASES[want] ?? []).includes(city);
  const stateOk = !normalise(area.state) || normalise(address?.state) === normalise(area.state);
  const pin = String(address?.postalCode ?? '').replace(/\D/g, '');
  const prefixes = area.pinPrefixes ?? [];
  const pinOk = !checkPin || !prefixes.length || prefixes.some((prefix) => pin.startsWith(prefix));
  return cityOk && stateOk && pinOk;
}
