import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import type { CloudinaryImage } from '@/types';
import { cn } from '@/utils/cn';
import { Image } from '@/components/ui/Image';
import { GALLERY_SIZES } from '@/utils/image';
import { useCanHover } from '@/hooks/useMediaQuery';

interface ProductGalleryProps {
  images: CloudinaryImage[];
  productName: string;
}

/**
 * Product gallery.
 *
 * Desktop: thumbnail column, a large main image and cursor-tracking zoom.
 * Mobile: a native horizontal snap-scroller, which beats any JS carousel for
 * feel and costs nothing in bundle size. Dots reflect the scroll position.
 */
export function ProductGallery({ images, productName }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const canHover = useCanHover();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const gallery = images.length ? images : [null];
  const activeImage = gallery[activeIndex] ?? gallery[0];

  // Reset when navigating between products.
  useEffect(() => {
    setActiveIndex(0);
    setIsZoomed(false);
  }, [productName]);

  /** Keeps the mobile dots in step with the scroller. */
  const handleScroll = () => {
    const node = scrollerRef.current;
    if (!node) return;
    const index = Math.round(node.scrollLeft / node.clientWidth);
    setActiveIndex(Math.min(Math.max(index, 0), gallery.length - 1));
  };

  const scrollToIndex = (index: number) => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTo({ left: index * node.clientWidth, behavior: 'smooth' });
  };

  const step = (direction: -1 | 1) => {
    const next = (activeIndex + direction + gallery.length) % gallery.length;
    setActiveIndex(next);
    scrollToIndex(next);
  };

  return (
    <div className="lg:flex lg:gap-4">
      {/* Desktop thumbnails */}
      {gallery.length > 1 && (
        <div className="hidden w-20 shrink-0 flex-col gap-2 lg:flex">
          {gallery.map((image, index) => (
            <button
              key={`${image?.url ?? 'placeholder'}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`View image ${index + 1} of ${gallery.length}`}
              aria-current={index === activeIndex}
              className={cn(
                'aspect-product overflow-hidden rounded-xl border-2 transition-all duration-300',
                index === activeIndex ? 'border-ink-black' : 'border-transparent hover:border-line',
              )}
            >
              <Image
                image={image}
                alt=""
                aspect={5 / 4}
                width={160}
                wrapperClassName="h-full w-full"
              />
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1">
        {/* Desktop main image with cursor-origin zoom */}
        <div
          className="relative hidden aspect-product overflow-hidden bg-surface lg:block rounded-2xl"
          onMouseMove={(event) => {
            if (!canHover) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setOrigin({
              x: ((event.clientX - rect.left) / rect.width) * 100,
              y: ((event.clientY - rect.top) / rect.height) * 100,
            });
          }}
          onMouseLeave={() => setIsZoomed(false)}
        >
          <Image
            image={activeImage}
            alt={`${productName} — image ${activeIndex + 1}`}
            aspect={5 / 4}
            sizes={GALLERY_SIZES}
            priority={activeIndex === 0}
            width={1200}
            wrapperClassName="absolute inset-0"
            className={cn(
              'transition-transform duration-slow ease-brand',
              isZoomed && 'scale-[1.9]',
            )}
            // Zoom towards wherever the cursor is, rather than the centre.
            style={isZoomed ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
          />

          {/* Zoom is opt-in via a button so moving the mouse does not jolt the page. */}
          <button
            type="button"
            onClick={() => setIsZoomed((zoomed) => !zoomed)}
            aria-pressed={isZoomed}
            aria-label={isZoomed ? 'Zoom out' : 'Zoom in'}
            className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-canvas/90 shadow-sm backdrop-blur transition-colors hover:bg-canvas"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Mobile swipe gallery */}
        <div className="relative lg:hidden">
          <div
            ref={scrollerRef}
            onScroll={handleScroll}
            className="scroll-rail aspect-product w-full"
            aria-label={`${productName} images`}
          >
            {gallery.map((image, index) => (
              <div
                key={`${image?.url ?? 'placeholder'}-m-${index}`}
                className="w-full shrink-0 snap-center"
              >
                <Image
                  image={image}
                  alt={`${productName} — image ${index + 1}`}
                  aspect={5 / 4}
                  sizes="100vw"
                  priority={index === 0}
                  wrapperClassName="aspect-product w-full overflow-hidden rounded-2xl"
                />
              </div>
            ))}
          </div>

          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center bg-canvas/85"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Next image"
                className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center bg-canvas/85"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
                {gallery.map((_, index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1 w-6 transition-colors duration-base',
                      index === activeIndex ? 'bg-ink-black' : 'bg-line',
                    )}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductGallery;
