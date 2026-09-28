/**
 * Cloudinary delivery helpers for the admin UI.
 *
 * Originals are kept at up to 2000px, which is right for the storefront but
 * wrong for a grid of sixty thumbnails — a media page that loads sixty 2MB
 * PNGs takes minutes on a normal connection. Every preview in the admin goes
 * through here so it asks Cloudinary for a small, modern-format copy instead.
 *
 * A URL that is not a Cloudinary delivery URL is returned untouched, so seed
 * placeholders and pasted external images keep working.
 */
const UPLOAD_MARKER = '/image/upload/';

export function resizedImageUrl(url: string | undefined | null, width: number): string {
  if (!url) return '';

  const marker = url.indexOf(UPLOAD_MARKER);
  if (marker === -1) return url;

  const start = marker + UPLOAD_MARKER.length;
  const transform = `f_auto,q_auto,w_${width},c_limit/`;

  // A URL we already transformed must not be transformed twice.
  if (url.slice(start).startsWith('f_auto,')) return url;

  return `${url.slice(0, start)}${transform}${url.slice(start)}`;
}

/** Grid tiles and small previews. */
export const thumbUrl = (url: string | undefined | null) => resizedImageUrl(url, 400);

/** The larger preview inside a detail dialog. */
export const previewUrl = (url: string | undefined | null) => resizedImageUrl(url, 900);

export default resizedImageUrl;
