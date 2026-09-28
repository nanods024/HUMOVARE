/**
 * Sends the shopper to PhonePe's hosted checkout.
 *
 * Only an https link on phonepe.com is followed — the server already checks
 * this, and the browser checks again so a tampered response can never send
 * someone to a look-alike payment page.
 */
export function isPhonePeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && (host === 'phonepe.com' || host.endsWith('.phonepe.com'));
  } catch {
    return false;
  }
}

export function goToPhonePe(url: string): boolean {
  if (!isPhonePeCheckoutUrl(url)) return false;
  window.location.assign(url);
  return true;
}
