import { StoreSetting } from '../models/StoreSetting.js';
import { env } from '../config/env.js';
import { DEFAULT_COD_PIN_AREAS } from '../constants/codAreas.js';

/**
 * Store settings, read by checkout, the cart and the storefront.
 *
 * Pricing code runs synchronously, so the settings are held in memory: loaded
 * at boot, replaced the moment an admin saves, and re-read in the background
 * every little while so a second server instance catches up on its own.
 * Until the first load finishes, the defaults below apply — they match the
 * model defaults and the old environment values, so nothing changes price
 * while the database is still connecting.
 */

const REFRESH_MS = 30 * 1000;

export const DEFAULTS = Object.freeze({
  storeName: 'HUMOVARE',
  tagline: 'Not just clothing. A movement.',
  contactEmail: '',
  phone: '',
  whatsapp: '',
  instagram: '',
  address: { line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India' },
  shipping: {
    freeShippingThreshold: env.commerce.freeShippingThreshold,
    shippingFee: env.commerce.shippingFee,
    dispatchDays: 2,
    deliveryEstimateDays: 6,
    codEnabled: true,
    codMaxOrderValue: 10000,
    codCityOnly: true,
    codCity: 'Visakhapatnam',
    codState: 'Andhra Pradesh',
    codPinCheck: true,
    codPinPrefixes: ['530', '531'],
    codPinAreas: DEFAULT_COD_PIN_AREAS,
  },
  returns: { windowDays: 7, freePickup: true },
});

let cached = null;
let loadedAt = 0;
let loading = null;

/** Reads (creating on first run) the single settings document. */
export async function readSettingsDocument() {
  const existing = await StoreSetting.findOne({ key: 'default' }).lean();
  if (existing) return existing;

  return StoreSetting.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function loadStoreSettings() {
  loading ??= readSettingsDocument()
    .then((doc) => {
      cached = doc;
      loadedAt = Date.now();
      return doc;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Called after an admin saves, so the change is live immediately. */
export function setStoreSettings(doc) {
  cached = doc;
  loadedAt = Date.now();
}

/** The current settings, merged over the defaults. Never throws, never waits. */
export function storeSettings() {
  if (Date.now() - loadedAt > REFRESH_MS) {
    loadStoreSettings().catch(() => {});
  }
  const doc = cached ?? {};
  return {
    ...DEFAULTS,
    ...doc,
    address: { ...DEFAULTS.address, ...(doc.address ?? {}) },
    shipping: { ...DEFAULTS.shipping, ...(doc.shipping ?? {}) },
    returns: { ...DEFAULTS.returns, ...(doc.returns ?? {}) },
  };
}

// Spellings people actually type for the default COD city.
const CITY_ALIASES = {
  visakhapatnam: ['vishakhapatnam', 'visakapatnam', 'vishakapatnam', 'visakhapatanam', 'vizag', 'vishakha', 'vskp', 'waltair'],
};

const normalise = (value) => String(value ?? '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * The one city Cash on Delivery is limited to, or null when COD is open to
 * every address.
 */
export function codArea(s = storeSettings()) {
  const { codCityOnly, codCity, codState, codPinCheck, codPinPrefixes, codPinAreas } = s.shipping;
  if (!codCityOnly || !normalise(codCity)) return null;
  // The PIN check can be switched off in Settings; then only the city counts.
  if (codPinCheck === false) return { city: codCity, state: codState || '', pinPrefixes: [], pinAreas: [] };

  const pinAreas = (codPinAreas ?? [])
    .filter((entry) => /^\d{6}$/.test(String(entry?.pin ?? '')))
    .map(({ pin, area }) => ({ pin: String(pin), area: String(area ?? '') }));
  // The exact list wins; the prefixes are the fallback when it is empty.
  const pinPrefixes = pinAreas.length
    ? pinAreas.map((entry) => entry.pin)
    : (codPinPrefixes ?? []).map((p) => String(p).replace(/\D/g, '')).filter(Boolean);
  return { city: codCity, state: codState || '', pinPrefixes, pinAreas };
}

/**
 * Whether a delivery address may use Cash on Delivery under the city rule.
 * Matches on city (common spellings included), state when one is set, and the
 * PIN code against the area's prefixes.
 */
export function isCodAddress(address, s = storeSettings()) {
  const area = codArea(s);
  if (!area) return true;

  const want = normalise(area.city);
  const city = normalise(address?.city);
  const cityOk = city === want || (CITY_ALIASES[want] ?? []).includes(city);
  const stateOk = !normalise(area.state) || normalise(address?.state) === normalise(area.state);
  // A free-text city is easy to type; the PIN code has to be in the area too.
  const pin = String(address?.postalCode ?? '').replace(/\D/g, '');
  const pinOk = !area.pinPrefixes.length || area.pinPrefixes.some((prefix) => pin.startsWith(prefix));
  return cityOk && stateOk && pinOk;
}

/** "Choose one of the listed …" or "… PINs start with 530 or 531." */
export function pinRule(area) {
  return area.pinAreas?.length
    ? `Choose one of the listed ${area.city} PIN codes.`
    : `${area.city} PINs start with ${area.pinPrefixes.join(' or ')}.`;
}

/**
 * Cross-checks city against PIN. An address that says it is in the COD city
 * (Visakhapatnam) must use one of that city's PIN prefixes; returns the error
 * to show, or null. Only applies while the PIN check is switched on.
 */
export function codCityPinError(address, s = storeSettings()) {
  const area = codArea(s);
  if (!area || !area.pinPrefixes.length) return null;
  const claimsCity = isCodAddress(address, {
    shipping: { codCityOnly: true, codCity: area.city, codState: '', codPinCheck: false },
  });
  if (!claimsCity) return null;
  const pin = String(address?.postalCode ?? '').replace(/\D/g, '');
  if (area.pinPrefixes.some((prefix) => pin.startsWith(prefix))) return null;
  return `${pin || 'This PIN'} is not a ${area.city} PIN code we deliver Cash on Delivery to. ${pinRule(area)}`;
}

/**
 * What the storefront may see. Contact details and shop rules only — nothing
 * about who edited them or when.
 */
export function publicStoreSettings() {
  const s = storeSettings();
  return {
    storeName: s.storeName,
    tagline: s.tagline,
    email: s.contactEmail,
    phone: s.phone,
    whatsapp: s.whatsapp,
    instagram: s.instagram,
    address: {
      line1: s.address.line1,
      line2: s.address.line2,
      city: s.address.city,
      state: s.address.state,
      postalCode: s.address.postalCode,
    },
    shipping: {
      freeShippingThreshold: s.shipping.freeShippingThreshold,
      shippingFee: s.shipping.shippingFee,
      dispatchDays: s.shipping.dispatchDays,
      deliveryDays: s.shipping.deliveryEstimateDays,
    },
    cod: {
      enabled: s.shipping.codEnabled,
      maxOrderValue: s.shipping.codMaxOrderValue,
      area: codArea(s),
    },
    returns: { windowDays: s.returns.windowDays },
  };
}

export default {
  loadStoreSettings,
  setStoreSettings,
  storeSettings,
  publicStoreSettings,
  readSettingsDocument,
  codArea,
  isCodAddress,
};
