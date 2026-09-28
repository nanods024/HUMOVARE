import type { CloudinaryImage } from '@/types';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;

/** Widths the grid and gallery actually render at. */
export const RESPONSIVE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1600];

/**
 * Builds a Cloudinary delivery URL.
 *
 * `f_auto` negotiates AVIF/WebP per browser and `q_auto` picks a per-image
 * quality target — together they do most of the page-weight work. Images that
 * are not Cloudinary-backed (seed placeholders, external URLs) pass through
 * untouched so the storefront works before real photography exists.
 */
export function cloudinaryUrl(
  image: CloudinaryImage | null | undefined,
  options: { width?: number; height?: number; crop?: string } = {},
): string {
  if (!image?.url) return '';
  if (!image.publicId || !CLOUD_NAME) return image.url;

  const { width, height, crop = 'fill' } = options;
  const transforms = ['f_auto', 'q_auto', 'dpr_auto'];

  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  if (width || height) transforms.push(`c_${crop}`, 'g_auto');

  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transforms.join(',')}/${image.publicId}`;
}

/**
 * srcset for a given aspect ratio, so the browser downloads the smallest file
 * that still fills the slot. Returns '' for non-Cloudinary images, in which
 * case the caller falls back to a plain `src`.
 */
export function buildSrcSet(
  image: CloudinaryImage | null | undefined,
  aspect = 5 / 4,
): string | undefined {
  if (!image?.publicId || !CLOUD_NAME) return undefined;

  return RESPONSIVE_WIDTHS.map(
    (width) => `${cloudinaryUrl(image, { width, height: Math.round(width * aspect) })} ${width}w`,
  ).join(', ');
}

/** The first two images of a product — primary, plus the hover state. */
export function productImagePair(product: {
  thumbnail?: CloudinaryImage | null;
  images?: CloudinaryImage[];
}): { primary: CloudinaryImage | null; secondary: CloudinaryImage | null } {
  const gallery = product.images ?? [];
  const primary = product.thumbnail ?? gallery[0] ?? null;

  // Avoid using the same file twice — a "hover" that does nothing looks broken.
  const secondary = gallery.find((image) => image.url !== primary?.url) ?? null;

  return { primary, secondary };
}

/** Standard `sizes` attribute for a 4-across product grid. */
export const GRID_SIZES = '(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw';
export const GALLERY_SIZES = '(min-width: 1024px) 50vw, 100vw';
