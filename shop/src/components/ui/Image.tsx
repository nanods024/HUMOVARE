import { useState } from 'react';
import { cn } from '@/utils/cn';
import { cloudinaryUrl, buildSrcSet } from '@/utils/image';
import type { CloudinaryImage } from '@/types';

interface ImageProps {
  image: CloudinaryImage | null | undefined;
  alt: string;
  /** Width/height ratio used to build the srcset (height / width). */
  aspect?: number;
  sizes?: string;
  className?: string;
  wrapperClassName?: string;
  /** Above-the-fold images should load eagerly and get fetchpriority=high. */
  priority?: boolean;
  width?: number;
  style?: React.CSSProperties;
}

/**
 * Optimised image with a reserved aspect box.
 *
 * Every image renders inside a fixed-ratio wrapper so the grid never reflows
 * as pictures arrive — that is most of the cumulative layout shift budget on
 * a storefront. Cloudinary-backed assets also get a responsive srcset.
 *
 * The picture has no entrance effect, deliberately. Anything that starts it at
 * `opacity: 0` — a JavaScript `onLoad` flag or a CSS fade — leaves a grid of
 * blank boxes whenever the thing meant to reveal it does not run. An `onLoad`
 * handler misses images the browser already had cached, because the load event
 * can fire before React attaches the listener; a CSS animation is skipped or
 * deferred when the page is throttled or painted off-screen. Both failures
 * have happened here. The image is visible from its first frame and paints as
 * it decodes, over the plain surface that reserves its space.
 */
export function Image({
  image,
  alt,
  aspect = 5 / 4,
  sizes = '100vw',
  className,
  wrapperClassName,
  priority = false,
  width = 800,
  style,
}: ImageProps) {
  const [hasFailed, setHasFailed] = useState(false);

  const src = cloudinaryUrl(image, { width, height: Math.round(width * aspect) });
  const srcSet = buildSrcSet(image, aspect);

  // No picture, or it failed to load: hold the space with a plain tint rather
  // than a caption, so a product with missing photography still lines up.
  if (!src || hasFailed) {
    return <div className={cn('bg-surface', wrapperClassName)} aria-hidden="true" />;
  }

  return (
    <div className={cn('relative overflow-hidden bg-surface', wrapperClassName)}>
      <img
        // Keyed on the source so a swapped image replaces the element rather
        // than mutating one that already reported itself loaded.
        key={src}
        src={src}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        // fetchPriority is not in React 18's typings yet.
        {...({ fetchpriority: priority ? 'high' : undefined } as Record<string, string | undefined>)}
        onError={() => setHasFailed(true)}
        style={style}
        className={cn('h-full w-full object-cover', className)}
      />
    </div>
  );
}

export default Image;
