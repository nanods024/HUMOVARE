/**
 * Email domains a customer may use for a new address. Mirrors
 * CUSTOMER_EMAIL_DOMAINS in server/src/constants — the server is what
 * enforces it; this only lets the form say so before submitting.
 *
 * Deliberately not applied to sign-in or password reset, so an existing
 * account on another domain can always reach its orders.
 */
export const CUSTOMER_EMAIL_DOMAINS = ['gmail.com'] as const;

export const CUSTOMER_EMAIL_MESSAGE = 'Please use a Gmail address (ending in @gmail.com)';

export function isCustomerEmail(value: string): boolean {
  const domain = value.trim().toLowerCase().split('@')[1] ?? '';
  return (CUSTOMER_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
