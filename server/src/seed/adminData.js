/**
 * Home page seed.
 *
 * These sections are a faithful transcription of what the customer home page
 * already renders — same order, same copy, same imagery. Seeding them means
 * the storefront looks identical the moment it starts reading from the CMS,
 * and the admin can edit from there rather than starting from a blank page.
 */

const PICSUM = process.env.SEED_IMAGE_BASE || 'https://picsum.photos/seed';

const image = (seed, w = 1200, h = 1500, alt = '') => ({
  url: `${PICSUM}/${seed}/${w}/${h}`,
  publicId: '',
  alt,
  width: w,
  height: h,
});

export const homepageSections = [
  {
    type: 'hero',
    key: 'hero',
    name: 'Hero',
    eyebrow: 'The first drop',
    title: 'Built for your',
    highlight: 'movement',
    description: 'Printed. Heavyweight. Made to move.',
    // Real campaign photography, served from the customer app's own public
    // folder — not a picsum placeholder — so a reseed doesn't undo it.
    image: {
      url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/hero-banner.webp`,
      publicId: '',
      alt: 'HUMOVARE campaign',
      width: 1920,
      height: 1200,
    },
    primaryCta: { label: 'Shop new drops', url: '/new-drops', variant: 'primary' },
    secondaryCta: null,
    sortOrder: 0,
    status: 'published',
  },
  {
    type: 'categories',
    key: 'categories',
    name: 'Categories',
    title: 'Categories',
    link: { label: 'View everything', url: '/shop' },
    // No explicit picks: falls back to the nav product types.
    sortOrder: 1,
    status: 'published',
  },
  {
    type: 'collections',
    key: 'collections',
    name: 'Collections',
    eyebrow: 'Curated',
    title: 'Collections',
    description: 'Edits pulled together by hand, not by algorithm.',
    link: { label: 'Shop everything', url: '/shop' },
    // No explicit picks: every published collection appears, and the section
    // hides itself until there is one.
    sortOrder: 2,
    status: 'published',
  },
  {
    type: 'productRail',
    key: 'new-drops-rail',
    name: 'New drops rail',
    eyebrow: 'Just landed',
    title: 'New drops',
    description: 'The latest pieces to come out of the studio.',
    link: { label: 'All new drops', url: '/new-drops' },
    source: 'newDrops',
    limit: 8,
    sortOrder: 3,
    status: 'published',
  },
  {
    type: 'productRail',
    key: 'bestsellers-rail',
    name: 'Bestsellers rail',
    eyebrow: 'Community favourites',
    title: 'Bestsellers',
    description: 'The pieces our community keeps coming back for.',
    link: { label: 'All bestsellers', url: '/bestsellers' },
    source: 'bestsellers',
    limit: 8,
    background: 'surface',
    sortOrder: 4,
    status: 'published',
  },
  {
    type: 'brandStory',
    key: 'brand-story',
    name: 'Brand story',
    eyebrow: 'Our story',
    title: 'Not just clothes.',
    highlight: 'A way to move.',
    image: image('humovare-story-01', 1000, 1250, 'HUMOVARE editorial'),
    items: [
      {
        text: 'HUMOVARE started with a straightforward complaint: most everyday clothing gives up early. The shoulder drops, the neck waves out, the black fades to grey — and a piece you liked becomes one you keep out of habit.',
      },
      {
        text: 'So we build the other way round. Heavier fabric than the category expects, seams taped where they take strain, colour dyed to hold. Fewer pieces, made properly, in a palette that does not date.',
      },
      {
        text: 'The name is about movement, and so is the mark — a figure mid-stride, cut into the H. What you wear should keep up with where you are going.',
      },
    ],
    primaryCta: { label: 'Read our story', url: '/about', variant: 'outline' },
    sortOrder: 5,
    status: 'published',
  },
  {
    type: 'styleRail',
    key: 'shop-by-style',
    name: 'Shop by style',
    eyebrow: 'Find your silhouette',
    title: 'Shop by style',
    description: 'Five directions, one wardrobe.',
    // Each `url` points straight at the category route (`/oversized`) rather
    // than `/shop?collection=oversized` — these slugs are Category documents
    // (type "style"), not curated Collections, and `?collection=` on /shop
    // is the plural curated-collections facet, which 404s for a slug that
    // isn't one.
    items: [
      { slug: 'oversized', title: 'Oversized', copy: 'Deliberate volume.', url: '/oversized', image: image('humovare-style-oversized', 600, 800).url },
      { slug: 'graphic-tees', title: 'Graphic Tees', copy: 'Say it without shouting.', url: '/graphic-tees', image: image('humovare-style-graphic-tees', 600, 800).url },
      { slug: 'minimal', title: 'Minimal', copy: 'Nothing spare.', url: '/minimal', image: image('humovare-style-minimal', 600, 800).url },
      { slug: 'streetwear', title: 'Streetwear', copy: 'Built for pavement.', url: '/streetwear', image: image('humovare-style-streetwear', 600, 800).url },
      { slug: 'essentials', title: 'Essentials', copy: 'The base layer.', url: '/essentials', image: image('humovare-style-essentials', 600, 800).url },
    ],
    sortOrder: 6,
    status: 'published',
  },
  {
    type: 'quality',
    key: 'quality',
    name: 'Quality story',
    eyebrow: 'Made properly',
    title: 'Built to be worn',
    description: 'Premium is not a price point. It is what the piece looks like after thirty washes.',
    image: image('humovare-fabric-detail', 800, 800, 'HUMOVARE fabric detail'),
    background: 'dark',
    items: [
      { icon: 'layers', title: 'Heavyweight fabric', copy: '240–400 GSM combed cotton and brushed fleece. Substantial enough to hold a shape wash after wash.' },
      { icon: 'scissors', title: 'Honest construction', copy: 'Taped shoulder seams, flat-locked joins and bound necks — the details that decide whether a piece lasts.' },
      { icon: 'sparkles', title: 'Print that survives', copy: 'Water-based and high-density inks, double-cured so a graphic will not crack along the fold.' },
      { icon: 'shirt', title: 'Considered fit', copy: 'Every silhouette gets its own block — oversized, regular and boxy are drafted separately, not graded from one pattern.' },
      { icon: 'droplets', title: 'Colour that holds', copy: 'Reactive dyes and a cold rinse, so black stays black rather than drifting to grey.' },
    ],
    sortOrder: 7,
    status: 'published',
  },
  {
    type: 'community',
    key: 'community',
    name: 'Community wall',
    eyebrow: 'Tag @humovare',
    title: 'The HUMOVARE community',
    description: 'Worn on real streets, by real people. Share yours and you might land on this wall.',
    link: { label: 'Follow on Instagram', url: '/contact' },
    items: Array.from({ length: 6 }, (_, index) => ({
      id: `community-${index + 1}`,
      image: image(`humovare-community-${index + 1}`, 700, 700).url,
      alt: `HUMOVARE community outfit ${index + 1}`,
      url: '',
    })),
    sortOrder: 8,
    status: 'published',
  },
  {
    type: 'trust',
    key: 'trust',
    name: 'Trust & service',
    title: 'Why shop with HUMOVARE',
    items: [
      { icon: 'shield-check', title: 'Secure payments', copy: 'Encrypted checkout, trusted providers.' },
      { icon: 'rotate-ccw', title: 'Easy returns', copy: '7-day returns on unworn pieces.' },
      { icon: 'award', title: 'Premium quality', copy: 'Heavyweight fabric, checked by hand.' },
      { icon: 'truck', title: 'Fast shipping', copy: 'Dispatched within 48 hours.' },
      { icon: 'headphones', title: 'Real support', copy: 'Humans, replying within a day.' },
    ],
    sortOrder: 9,
    status: 'published',
  },
];

/** Mirrors the real business details already in the storefront constants. */
export const storeSettings = {
  storeName: 'HUMOVARE',
  tagline: 'Not just clothing. A movement.',
  contactEmail: 'hello@humovare.in',
  supportEmail: 'hello@humovare.in',
  phone: '+91 79893 55385',
  whatsapp: 'https://wa.me/917989355385',
  instagram: 'https://instagram.com/humovare',
  address: {
    line1: 'Door No. 43-18-41, P Savitri Enclave, 3F4',
    line2: 'TSN Colony, Venkat Raju Nagar, Dondaparthy',
    city: 'Visakhapatnam',
    state: 'Andhra Pradesh',
    postalCode: '530016',
    country: 'India',
  },
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  seo: {
    defaultTitle: 'HUMOVARE — Built For Your Movement',
    defaultDescription:
      'HUMOVARE menswear — printed heavyweight tees, brushed fleece hoodies, shirts and bottom wear. Not just clothing, a movement.',
  },
};
