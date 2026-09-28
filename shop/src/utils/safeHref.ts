/**
 * Links that come from the admin (hero buttons, section links, social
 * profiles) are only followed when they point somewhere safe: a path on this
 * site, an anchor, or an https:// address. Anything else — javascript:,
 * data:, "//other-host" — falls back, so a bad value saved before the server
 * checked it can never run on a shopper's click.
 */
const SAFE = /^(\/(?![/\\])|#|https:\/\/)[^\s"'<>]*$/i;

export function safeHref(url: string | null | undefined, fallback: string): string {
  const value = (url ?? '').trim();
  return value && SAFE.test(value) ? value : fallback;
}
