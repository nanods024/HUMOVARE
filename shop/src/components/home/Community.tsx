import { useEffect, useRef, useState } from 'react';
import { Instagram, ChevronLeft, ChevronRight } from 'lucide-react';

import { InstagramEmbed } from './InstagramEmbed';
import { useInstagramEmbeds } from '@/hooks/useInstagramEmbeds';
import { Image } from '@/components/ui/Image';

import { cn } from '@/utils/cn';
import { useStoreSettings } from '@/hooks/useStoreSettings';

/**
 * Community wall — the shop's Instagram, on the home page.
 *
 * Posts are managed from the admin as a list of Instagram links, and each one
 * is rendered by Instagram's own embed: the avatar, the video, the like count
 * and the comment box are all theirs. That is the only way a reel can actually
 * play here, and it is also why the card reads as a real post rather than a
 * screenshot of one.
 *
 * The images below are the fallback for a storefront with no links configured
 * yet — a plain wall of photography, no third-party script.
 */
const PLACEHOLDER_TILES = Array.from({ length: 6 }, (_, index) => ({
  id: `community-${index + 1}`,
  image: { url: `https://picsum.photos/seed/humovare-community-${index + 1}/700/700` },
  alt: `HUMOVARE community outfit ${index + 1}`,
}));

/** Only a real post permalink can be embedded. */
const isInstagramPost = (url: string) =>
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\//i.test(url ?? '');

export interface CommunityTile {
  id?: string;
  image?: string;
  alt?: string;
  url?: string;
  caption?: string;
}

export interface CommunityProps {
  eyebrow?: string;
  title?: string;
  description?: string;
  tiles?: CommunityTile[];
}

export function Community({
  eyebrow = 'Tag @humovare',
  title = 'The HUMOVARE community',
  description = 'Worn on real streets, by real people. Share yours and you might land on this wall.',
  tiles,
}: CommunityProps = {}) {
  const { brand: BRAND } = useStoreSettings();
  const section = useRef<HTMLElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  const [isNear, setIsNear] = useState(false);
  const [canScroll, setCanScroll] = useState(false);

  // Embeddable posts drive the wall; anything else is treated as imagery.
  const posts = (tiles ?? [])
    .filter((tile) => isInstagramPost(tile.url ?? ''))
    .map((tile, index) => ({
      id: tile.id ?? `post-${index + 1}`,
      url: tile.url as string,
      caption: tile.caption ?? tile.alt ?? '',
    }));

  const fallbackTiles = tiles
    ? tiles
        .filter((tile) => Boolean(tile.image))
        .map((tile, index) => ({
          id: tile.id ?? `community-${index + 1}`,
          image: { url: tile.image as string },
          alt: tile.alt || `HUMOVARE community post ${index + 1}`,
        }))
    : PLACEHOLDER_TILES;

  /**
   * The row of iframes is the heaviest thing on the page, so it waits until
   * the section is nearly in view.
   *
   * The timer is not a nicety. An IntersectionObserver that never delivers —
   * throttled tab, a browser deferring work, a rendering surface that is not
   * compositing — would leave this wall as a row of skeletons for good, which
   * is the same "reveal that never runs" failure this codebase has hit twice
   * before. After a few seconds the embeds load regardless: below the fold,
   * that costs nothing, and it makes the section impossible to strand.
   */
  useEffect(() => {
    const node = section.current;
    if (posts.length === 0) return undefined;

    const failsafe = window.setTimeout(() => setIsNear(true), 3000);

    if (!node || typeof IntersectionObserver === 'undefined') {
      setIsNear(true);
      return () => window.clearTimeout(failsafe);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px' },
    );

    observer.observe(node);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
    };
  }, [posts.length]);

  const status = useInstagramEmbeds(isNear, posts.length);

  // Arrows only earn their place when the rail actually overflows — Instagram
  // resizes its own cards, so this is measured rather than assumed from the
  // number of posts.
  useEffect(() => {
    const node = rail.current;
    if (!node) return undefined;

    const measure = () => setCanScroll(node.scrollWidth > node.clientWidth + 8);
    measure();

    const timer = window.setInterval(measure, 1000);
    window.addEventListener('resize', measure);

    // Instagram is done resizing well inside ten seconds.
    const stop = window.setTimeout(() => window.clearInterval(timer), 10_000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
      window.removeEventListener('resize', measure);
    };
  }, [posts.length, status]);

  const scrollRail = (direction: -1 | 1) => {
    const node = rail.current;
    if (!node) return;
    node.scrollBy({ left: direction * Math.round(node.clientWidth * 0.8), behavior: 'smooth' });
  };

  // Emptying the wall in the admin removes the section rather than leaving a
  // heading above a blank row.
  if (posts.length === 0 && fallbackTiles.length === 0) return null;

  return (
    <section ref={section} id="community" className="py-16 md:py-24">
      <div className="container-page text-center">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="text-display-md">{title}</h2>
        {description && (
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
        <span aria-hidden="true" className="mx-auto mt-6 block h-px w-16 bg-line" />
      </div>

      <div className="relative mt-8">
        {posts.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label="Scroll left"
              className={cn(
                'absolute left-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-canvas/95 shadow-sm transition-colors hover:bg-surface',
                canScroll ? 'hidden lg:grid' : 'hidden',
              )}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label="Scroll right"
              className={cn(
                'absolute right-2 top-1/2 z-10 h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-canvas/95 shadow-sm transition-colors hover:bg-surface',
                canScroll ? 'hidden lg:grid' : 'hidden',
              )}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <ul
              ref={rail}
              className={cn('scroll-rail scroll-rail-soft items-start gap-4 px-gutter', !canScroll && 'lg:justify-center')}
              aria-label="Instagram posts from the HUMOVARE community"
            >
              {posts.map((post) => (
                <li
                  key={post.id}
                  className="instagram-card w-[84%] shrink-0 snap-start sm:w-[22rem] md:w-[20.5rem]"
                >
                  <InstagramEmbed url={post.url} caption={post.caption} status={status} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ul className="container-page grid grid-cols-2 gap-2 md:grid-cols-6 md:gap-3">
            {fallbackTiles.map((tile) => (
              <li key={tile.id} className="group relative aspect-square overflow-hidden bg-surface rounded-2xl">
                <Image
                  image={tile.image}
                  alt={tile.alt}
                  aspect={1}
                  sizes="(min-width: 768px) 16vw, 45vw"
                  width={480}
                  wrapperClassName="absolute inset-0"
                  className="transition-transform duration-slow ease-brand group-hover:scale-105"
                />
                <a
                  href={BRAND.instagram}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-[background-color,opacity] duration-base group-hover:bg-black/55 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Instagram className="h-5 w-5" aria-hidden="true" />
                  <span className="sr-only">View on Instagram</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="container-page mt-10 text-center">
        <a
          href={BRAND.instagram}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            'inline-flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-brand',
            'text-ink transition-colors hover:text-primary',
          )}
        >
          Follow us @humovare
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

export default Community;
