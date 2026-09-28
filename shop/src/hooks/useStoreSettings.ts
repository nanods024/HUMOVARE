import { useQuery } from '@tanstack/react-query';

import { storefrontApi, type PublicStoreSettings } from '@/api/storefront';
import { queryKeys } from '@/lib/queryKeys';
import { BRAND } from '@/constants';
import { formatPrice } from '@/utils/format';

/**
 * Used until the settings arrive (or if the API cannot be reached), so the
 * footer, contact page and policies never render blank.
 */
const FALLBACK: PublicStoreSettings = {
  storeName: BRAND.name,
  tagline: BRAND.tagline,
  email: BRAND.email,
  phone: BRAND.phone,
  whatsapp: BRAND.whatsapp,
  instagram: BRAND.instagram,
  address: { ...BRAND.address },
  shipping: { freeShippingThreshold: 999, shippingFee: 79, dispatchDays: 2, deliveryDays: 6 },
  cod: { enabled: true, maxOrderValue: 10000, area: { city: 'Visakhapatnam', state: 'Andhra Pradesh' } },
  returns: { windowDays: 7 },
};


/**
 * Store settings from the admin — contact details, shipping, COD and returns.
 * Everything the storefront says about these reads from here.
 */
export function useStoreSettings() {
  const { data } = useQuery({
    queryKey: queryKeys.storeSettings,
    queryFn: () => storefrontApi.settings().then((response) => response.settings),
    staleTime: 5 * 60 * 1000,
  });

  const s = data ?? FALLBACK;
  // Blank fields fall back rather than printing nothing.
  const pick = (value: string, fallback: string) => (value && value.trim() ? value : fallback);

  const phone = pick(s.phone, FALLBACK.phone);
  const email = pick(s.email, FALLBACK.email);
  // Rendered as links everywhere, so only https addresses are used.
  const httpsOr = (value: string, fallback: string) => (/^https:\/\/\S+$/i.test(value?.trim() ?? '') ? value.trim() : fallback);
  const instagram = httpsOr(s.instagram, FALLBACK.instagram);

  return {
    brand: {
      name: pick(s.storeName, FALLBACK.storeName),
      tagline: pick(s.tagline, FALLBACK.tagline),
      email,
      phone,
      /** Digits only, for tel: links. */
      phoneRaw: phone.replace(/[^0-9]/g, ''),
      whatsapp: httpsOr(s.whatsapp, FALLBACK.whatsapp),
      instagram,
      /** "@humovare" from the Instagram link. */
      instagramHandle: `@${instagram.replace(/\/+$/, '').split('/').pop() ?? 'humovare'}`,
      address: s.address.line1 ? s.address : FALLBACK.address,
    },
    shipping: s.shipping,
    cod: s.cod,
    returns: s.returns,
    /** Ready-to-print values for copy: "₹999", "₹79", "7 days". */
    text: {
      freeAbove: formatPrice(s.shipping.freeShippingThreshold),
      fee: formatPrice(s.shipping.shippingFee),
      codMax: formatPrice(s.cod.maxOrderValue),
      returnDays: `${s.returns.windowDays} day${s.returns.windowDays === 1 ? '' : 's'}`,
      dispatch: s.shipping.dispatchDays <= 1 ? '24 hours' : `${s.shipping.dispatchDays} working days`,
      delivery: `${s.shipping.deliveryDays} working days`,
    },
  };
}

export type StoreSettingsView = ReturnType<typeof useStoreSettings>;

/** Swaps {tokens} in a line of copy for live settings values. */
export function fillCopy(text: string, view: StoreSettingsView): string {
  const tokens: Record<string, string> = { ...view.text, email: view.brand.email, name: view.brand.name };
  return text.replace(/\{(\w+)\}/g, (match, key: string) => tokens[key] ?? match);
}
