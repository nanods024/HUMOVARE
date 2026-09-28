import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeHref } from '@/utils/safeHref';
import { productsApi, categoriesApi, storefrontApi } from '@/api';
import type { HomepageSectionData } from '@/api/storefront';
import { queryKeys } from '@/lib/queryKeys';
import { useSeo } from '@/hooks/useSeo';
import { SITE_URL } from '@/constants';

import { Hero } from '@/components/home/Hero';
import { SectionHeader } from '@/components/home/SectionHeader';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { CollectionGrid } from '@/components/home/CollectionGrid';
import { StyleRail } from '@/components/home/StyleRail';
import { QualitySection } from '@/components/home/QualitySection';
import { BrandStory } from '@/components/home/BrandStory';
import { Community } from '@/components/home/Community';
import { TrustSection } from '@/components/home/TrustSection';
import { ProductRail } from '@/components/product/ProductGrid';
import { Reveal } from '@/components/common/Reveal';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import type { StoreSettingsView } from '@/hooks/useStoreSettings';

/** Organisation + site search markup, emitted once from the homepage. */
const structuredDataFor = (BRAND: StoreSettingsView['brand']) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: BRAND.name,
      url: SITE_URL,
      email: BRAND.email,
      telephone: BRAND.phone,
      address: {
        '@type': 'PostalAddress',
        streetAddress: `${BRAND.address.line1}, ${BRAND.address.line2}`,
        addressLocality: BRAND.address.city,
        addressRegion: BRAND.address.state,
        postalCode: BRAND.address.postalCode,
        addressCountry: 'IN',
      },
      sameAs: [BRAND.instagram],
    },
    {
      '@type': 'WebSite',
      name: BRAND.name,
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ],
});

/** Sections that render inside a `container-page` band rather than their own. */
const BANDED = new Set(['categories', 'collections', 'productRail', 'styleRail']);

/** SectionHeader takes a router `to`; the CMS stores a plain `url`. */
const toLink = (link: HomepageSectionData['link']) =>
  link?.label ? { label: link.label, to: safeHref(link.url, '/shop') } : undefined;

/**
 * Two adjacent banded sections would otherwise stack their vertical padding,
 * so the second one drops its top padding — the rhythm the static page was
 * hand-tuned to.
 */
function bandClass(section: HomepageSectionData, previous?: HomepageSectionData) {
  const collapseTop =
    section.background !== 'surface' &&
    previous &&
    BANDED.has(previous.type) &&
    previous.background !== 'surface';

  return collapseTop ? 'container-page pb-16 md:pb-24' : 'container-page py-16 md:py-24';
}

function renderSection(section: HomepageSectionData, previous?: HomepageSectionData) {
  switch (section.type) {
    case 'hero':
      return (
        <Hero
          key={section.id}
          eyebrow={section.eyebrow}
          title={section.title}
          highlight={section.highlight}
          description={section.description}
          image={section.image?.url}
          mobileImage={section.mobileImage?.url}
          primaryCta={section.primaryCta}
        />
      );

    case 'categories':
      return (
        <Reveal key={section.id} as="section" className={bandClass(section, previous)}>
          <SectionHeader
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
            link={toLink(section.link)}
          />
          <CategoryGrid categories={section.categories ?? []} />
        </Reveal>
      );

    case 'collections': {
      // Nothing published yet means no band at all, rather than a heading
      // sitting above an empty row.
      if ((section.collections?.length ?? 0) === 0) return null;

      return (
        <Reveal key={section.id} as="section" className={bandClass(section, previous)}>
          <SectionHeader
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
            link={toLink(section.link)}
          />
          <CollectionGrid collections={section.collections ?? []} />
        </Reveal>
      );
    }

    case 'productRail': {
      const body = (
        <>
          <SectionHeader
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
            link={toLink(section.link)}
          />
          <ProductRail products={section.products ?? []} />
        </>
      );

      // A surface-backed rail needs the tint to run full width, so the band
      // sits outside the container rather than on it.
      return section.background === 'surface' ? (
        <section key={section.id} className="bg-surface py-16 md:py-24">
          <Reveal className="container-page">{body}</Reveal>
        </section>
      ) : (
        <Reveal key={section.id} as="section" className={bandClass(section, previous)}>
          {body}
        </Reveal>
      );
    }

    case 'brandStory':
      return (
        <BrandStory
          key={section.id}
          eyebrow={section.eyebrow}
          title={section.title}
          highlight={section.highlight}
          image={section.image?.url}
          paragraphs={section.items.map((item) => item.text).filter(Boolean)}
          cta={section.primaryCta}
        />
      );

    case 'styleRail':
      return (
        <Reveal key={section.id} as="section" className={bandClass(section, previous)}>
          <SectionHeader
            eyebrow={section.eyebrow}
            title={section.title}
            description={section.description}
            link={toLink(section.link)}
          />
          <StyleRail tiles={section.items} />
        </Reveal>
      );

    case 'quality':
      return (
        <QualitySection
          key={section.id}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.description}
          image={section.image?.url}
          pillars={section.items}
        />
      );

    case 'community':
      return (
        <Community
          key={section.id}
          eyebrow={section.eyebrow}
          title={section.title}
          description={section.description}
          tiles={section.items}
        />
      );

    case 'trust':
      return <TrustSection key={section.id} items={section.items} />;

    default:
      return null;
  }
}

const HOME_CACHE_KEY = 'humovare.home.v1';

/** The last homepage sections shown on this device, if any. Never throws. */
function readCachedHomepage(): HomepageSectionData[] | undefined {
  try {
    const raw = window.localStorage.getItem(HOME_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as HomepageSectionData[]) : undefined;
  } catch {
    return undefined;
  }
}

function writeCachedHomepage(sections: HomepageSectionData[]) {
  try {
    window.localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(sections));
  } catch {
    // Storage full or blocked — the page simply loads without the head start.
  }
}

export function HomePage() {
  const { brand } = useStoreSettings();
  useSeo({
    title: 'HUMOVARE — Built For Your Movement',
    description:
      'HUMOVARE menswear — printed heavyweight tees, brushed fleece hoodies, shirts and bottom wear. Not just clothing, a movement.',
    canonicalPath: '/',
    structuredData: structuredDataFor(brand),
  });

  // Admin-managed layout. Content changes go live without a redeploy.
  const cms = useQuery({
    queryKey: queryKeys.homepage,
    queryFn: () => storefrontApi.homepage().then((response) => response.sections),
    staleTime: 5 * 60 * 1000,
    // The last homepage we showed, so a refresh paints the real hero at once
    // instead of a stand-in that is then swapped out (the "double pop"). It is
    // marked stale, so the current version is still fetched straight away.
    initialData: readCachedHomepage,
    initialDataUpdatedAt: 0,
  });

  useEffect(() => {
    if (cms.data?.length) writeCachedHomepage(cms.data);
  }, [cms.data]);

  const sections = cms.data ?? [];
  const hasCms = sections.length > 0;

  // The static layout below is the fallback for an empty or unreachable CMS.
  // It only fetches once we know the CMS has nothing for us, so the normal
  // path makes one request rather than three.
  const needsFallback = !cms.isPending && !hasCms;

  const feed = useQuery({
    queryKey: queryKeys.products.homeFeed,
    queryFn: productsApi.homeFeed,
    enabled: needsFallback,
  });

  const categories = useQuery({
    queryKey: queryKeys.categories.all,
    queryFn: () => categoriesApi.list({ nav: true }).then((res) => res.categories),
    enabled: needsFallback,
  });

  if (hasCms) {
    return <>{sections.map((section, index) => renderSection(section, sections[index - 1]))}</>;
  }

  // First visit, homepage still loading: hold the hero's space in the brand
  // colour. Rendering the fallback hero here would flash one image and then
  // replace it with the real one.
  if (cms.isPending) {
    return (
      <section
        aria-hidden="true"
        className="relative -mt-20 min-h-[120svh] bg-gradient-to-b from-[#7a0d12] via-[#b3121a] to-[#5c0a0e] md:-mt-28"
      />
    );
  }

  // Only the product types become tiles; virtual collections already have
  // their own nav links, and styles get the editorial rail further down.
  const categoryTiles = (categories.data ?? []).filter(
    (category) => category.type === 'product-type',
  );

  // While the CMS request is in flight the rails show their skeletons, exactly
  // as they did when the feed was the only source.
  const isPending = cms.isPending;

  return (
    <>
      <Hero />

      <Reveal as="section" className="container-page py-16 md:py-24">
        <SectionHeader
          title="Categories"
          link={{ label: 'View everything', to: '/shop' }}
        />
        <CategoryGrid categories={categoryTiles} isLoading={isPending || categories.isLoading} />
      </Reveal>

      <Reveal as="section" className="container-page pb-16 md:pb-24">
        <SectionHeader
          eyebrow="Just landed"
          title="New drops"
          description="The latest pieces to come out of the studio."
          link={{ label: 'All new drops', to: '/new-drops' }}
        />
        <ProductRail products={feed.data?.newDrops ?? []} isLoading={isPending || feed.isLoading} />
      </Reveal>

      <section className="bg-surface py-16 md:py-24">
        <Reveal className="container-page">
          <SectionHeader
            eyebrow="Community favourites"
            title="Bestsellers"
            description="The pieces our community keeps coming back for."
            link={{ label: 'All bestsellers', to: '/bestsellers' }}
          />
          <ProductRail products={feed.data?.bestsellers ?? []} isLoading={isPending || feed.isLoading} />
        </Reveal>
      </section>

      <BrandStory />

      <Reveal as="section" className="container-page py-16 md:py-24">
        <SectionHeader
          eyebrow="Find your silhouette"
          title="Shop by style"
          description="Five directions, one wardrobe."
        />
        <StyleRail />
      </Reveal>

      <QualitySection />

      <Community />

      <TrustSection />
    </>
  );
}

export default HomePage;
