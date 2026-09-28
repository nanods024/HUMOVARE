import { useSeo } from '@/hooks/useSeo';
import { useShopConfig } from '@/hooks/useShopConfig';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { ProductListing } from '@/components/shop/ProductListing';

const DEFAULT_TITLE = 'Shop all';
const DEFAULT_DESCRIPTION =
  'Every piece we make, in one place. Filter by size, colour and fit to narrow it down.';
const DEFAULT_SEO_DESCRIPTION =
  'Browse the full HUMOVARE menswear collection \u2014 printed heavyweight tees, brushed fleece hoodies, shirts and bottom wear.';

export function ShopPage() {
  // Heading, intro copy and SEO are admin-managed; every field keeps its
  // current wording as the default so the page is unchanged when unset.
  const config = useShopConfig();

  const title = config?.title || DEFAULT_TITLE;
  const description = config?.description || DEFAULT_DESCRIPTION;

  useSeo({
    title: config?.seo?.title || DEFAULT_TITLE,
    description: config?.seo?.description || DEFAULT_SEO_DESCRIPTION,
    canonicalPath: '/shop',
  });

  return (
    <div className="container-page py-6 md:py-10">
      <Breadcrumbs items={[{ label: 'Shop' }]} />

      <header className="my-6 md:my-8">
        <h1 className="text-display-md">{title}</h1>
        <p className="mt-2 max-w-prose text-sm text-ink-muted">{description}</p>
      </header>

      <ProductListing />
    </div>
  );
}

export default ShopPage;
