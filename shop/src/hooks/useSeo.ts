import { useEffect } from 'react';
import { SITE_URL } from '@/constants';
import { useStoreSettings } from '@/hooks/useStoreSettings';

interface SeoOptions {
  title: string;
  description?: string;
  image?: string;
  canonicalPath?: string;
  type?: 'website' | 'product' | 'article';
  noindex?: boolean;
  /** JSON-LD object injected as a <script type="application/ld+json">. */
  structuredData?: Record<string, unknown> | null;
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

/**
 * Per-route document metadata.
 *
 * This is a single-page app, so titles, canonicals and JSON-LD are written
 * imperatively on navigation. It gives crawlers that execute JavaScript the
 * right signals and keeps the structure ready for SSR/prerendering later.
 */
export function useSeo({
  title,
  description,
  image,
  canonicalPath,
  type = 'website',
  noindex = false,
  structuredData = null,
}: SeoOptions) {
  const storeName = useStoreSettings().brand.name;
  // Callers pass a fresh object every render; compare by content so the tags
  // are not torn down and rebuilt on every click.
  const structuredJson = structuredData ? JSON.stringify(structuredData) : '';

  useEffect(() => {
    const fullTitle = title.includes(storeName) ? title : `${title} | ${storeName}`;
    document.title = fullTitle;

    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }

    setMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    setMeta('meta[property="og:type"]', 'property', 'og:type', type);

    if (image) {
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
    }

    const path = canonicalPath ?? window.location.pathname;
    const canonicalUrl = `${SITE_URL}${path}`;

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);

    // Mid-funnel pages (cart, checkout, account) must stay out of the index.
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.name = 'robots';
        document.head.appendChild(robots);
      }
      robots.content = 'noindex, nofollow';
    } else if (robots) {
      robots.remove();
    }

    let ld: HTMLScriptElement | null = null;
    if (structuredJson) {
      ld = document.createElement('script');
      ld.type = 'application/ld+json';
      ld.textContent = structuredJson;
      ld.dataset.seo = 'route';
      document.head.appendChild(ld);
    }

    return () => {
      ld?.remove();
    };
  }, [title, description, image, canonicalPath, type, noindex, structuredJson, storeName]);
}
