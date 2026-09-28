import { Link } from 'react-router-dom';
import { safeHref } from '@/utils/safeHref';
import { STYLE_TILES } from '@/constants';

/**
 * "Shop by style" — editorial entry points that map to style categories.
 * Rendered as a snapping rail so all five stay reachable on a phone.
 */
export interface StyleTile {
  slug?: string;
  title?: string;
  copy?: string;
  url?: string;
  image?: string;
}

/** Tiles are admin-managed; the constant is the fallback. */
export function StyleRail({ tiles }: { tiles?: StyleTile[] } = {}) {
  const items: StyleTile[] = tiles?.length ? tiles : STYLE_TILES.map((tile) => ({ ...tile }));

  return (
    <div className="scroll-rail -mx-gutter gap-3 px-gutter md:mx-0 md:grid md:grid-cols-5 md:gap-4 md:px-0">
      {items.map((style) => (
        <Link
          key={style.slug ?? style.title}
          to={safeHref(style.url, `/${style.slug}`)}
          className="group relative flex aspect-[3/4] w-[58%] shrink-0 snap-start flex-col justify-end overflow-hidden bg-ink-black p-4 text-white md:w-auto rounded-2xl"
        >
          <img
            src={style.image || `https://picsum.photos/seed/humovare-style-${style.slug}/600/800`}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-55 transition-[transform,opacity] duration-slow ease-brand group-hover:scale-105 group-hover:opacity-70"
          />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

          <div className="relative">
            <h3 className="text-base font-black uppercase tracking-tight">{style.title}</h3>
            <p className="mt-0.5 text-[0.6875rem] text-white/70">{style.copy}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default StyleRail;
