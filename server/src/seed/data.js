/**
 * Seed catalogue for HUMOVARE — a menswear range.
 *
 * Every string here is original brand copy. No third-party brand names,
 * imagery or product text is used anywhere in this file.
 */

export const categories = [
  // Product types — the primary navigation
  { name: 'T-Shirts', slug: 't-shirts', type: 'product-type', displayOrder: 1, description: 'Heavyweight cotton tees built to hold their shape.' },
  { name: 'Hoodies', slug: 'hoodies', type: 'product-type', displayOrder: 2, description: 'Brushed fleece layers for colder, slower days.' },
  { name: 'Shirts', slug: 'shirts', type: 'product-type', displayOrder: 3, description: 'Structured shirting that works past the desk.' },
  { name: 'Bottom Wear', slug: 'bottom-wear', type: 'product-type', displayOrder: 4, description: 'Trousers, joggers and shorts with a considered drape.' },

  // Virtual collections — resolved from product flags, not references
  { name: 'New Drops', slug: 'new-drops', type: 'collection', isVirtual: true, displayOrder: 5, description: 'The latest pieces to land at HUMOVARE.' },
  { name: 'Bestsellers', slug: 'bestsellers', type: 'collection', isVirtual: true, displayOrder: 6, description: 'The pieces our community keeps coming back for.' },
  { name: 'Sale', slug: 'sale', type: 'collection', isVirtual: true, displayOrder: 7, description: 'Marked down, never marked lesser.' },
  { name: 'Designer Wear - Exclusive', slug: 'designer-wear-exclusive', type: 'collection', isVirtual: true, displayOrder: 8, description: 'Limited-run pieces, not restocked once they sell through.' },

  // Editorial styles
  { name: 'Oversized', slug: 'oversized', type: 'style', showInNav: false, displayOrder: 9, description: 'Dropped shoulders, generous body, deliberate volume.' },
  { name: 'Graphic Tees', slug: 'graphic-tees', type: 'style', showInNav: false, displayOrder: 10, description: 'Prints that say something without shouting.' },
  { name: 'Minimal', slug: 'minimal', type: 'style', showInNav: false, displayOrder: 11, description: 'Clean lines. Quiet colour. Nothing spare.' },
  { name: 'Streetwear', slug: 'streetwear', type: 'style', showInNav: false, displayOrder: 12, description: 'Built for pavement, not for polish.' },
  { name: 'Essentials', slug: 'essentials', type: 'style', showInNav: false, displayOrder: 13, description: 'The pieces everything else is styled around.' },
];

const BLACK = { name: 'Jet Black', slug: 'jet-black', hex: '#111111' };
const WHITE = { name: 'Off White', slug: 'off-white', hex: '#F4EFED' };
const RED = { name: 'Signature Red', slug: 'signature-red', hex: '#D42630' };
const OXBLOOD = { name: 'Oxblood', slug: 'oxblood', hex: '#5E1219' };
const CHARCOAL = { name: 'Charcoal', slug: 'charcoal', hex: '#33363B' };
const SAND = { name: 'Sand', slug: 'sand', hex: '#C9BBA5' };
const OLIVE = { name: 'Deep Olive', slug: 'deep-olive', hex: '#4A5240' };
const SLATE = { name: 'Slate Blue', slug: 'slate-blue', hex: '#4C5B6B' };
const BONE = { name: 'Bone', slug: 'bone', hex: '#E8E2D8' };

const TEE_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const TOP_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const WAIST_SIZES = ['28', '30', '32', '34', '36'];

const CARE = [
  'Machine wash cold with like colours',
  'Do not bleach',
  'Tumble dry low',
  'Warm iron, avoid the print',
];

export const products = [
  {
    name: 'HUMOVARE Core Oversized Tee',
    shortDescription: 'A 240 GSM oversized tee with a dropped shoulder and a body that keeps its line.',
    description:
      'The Core Oversized Tee is where the HUMOVARE wardrobe starts. Knitted from 240 GSM combed cotton, it holds a deliberate, boxy volume instead of collapsing after a wash. The shoulder is dropped just far enough to read as intentional, the neck is ribbed and bound so it will not wave out, and the hem sits at the hip on most frames. Wear it on its own or as the base layer under everything else in the range.',
    categorySlug: 't-shirts',
    collectionSlugs: ['oversized', 'essentials'],
    price: 1299,
    mrp: 1799,
    colors: [BLACK, WHITE, RED],
    sizes: TEE_SIZES,
    fit: 'oversized',
    tags: ['oversized', 'tee', 'essentials', 'cotton', 'core'],
    highlights: ['240 GSM combed cotton', 'Dropped shoulder', 'Ribbed bound neck', 'Pre-shrunk'],
    isFeatured: true,
    isBestSeller: true,
    isNewDrop: true,
    soldCount: 412,
  },
  {
    name: 'HUMOVARE Signature Hoodie',
    shortDescription: 'Brushed 400 GSM fleece with a double-layer hood and a tonal chest mark.',
    description:
      'Our Signature Hoodie is the heaviest piece we make and the one we are judged on. The 400 GSM loopback fleece is brushed on the inside so it feels broken in from the first wear, and the hood is cut in two layers so it stands up instead of folding flat. Ribbing at the cuff and hem is knitted with elastane so it recovers rather than stretching out. The chest mark is embroidered tonally: visible up close, quiet from across a room.',
    categorySlug: 'hoodies',
    collectionSlugs: ['streetwear', 'essentials'],
    price: 2799,
    mrp: 3999,
    colors: [BLACK, CHARCOAL, RED],
    sizes: TOP_SIZES,
    fit: 'relaxed',
    tags: ['hoodie', 'fleece', 'signature', 'winter'],
    highlights: ['400 GSM brushed fleece', 'Double-layer hood', 'Tonal embroidery', 'Elastane-blend ribbing'],
    isFeatured: true,
    isBestSeller: true,
    soldCount: 288,
  },
  {
    name: 'HUMOVARE Essential Black Tee',
    shortDescription: 'The straight-cut black tee that every other piece is styled around.',
    description:
      'Not every tee needs to be oversized. The Essential Black Tee is cut straight through the body with a set-in sleeve and a shorter hem, which makes it the one that tucks. The black is dyed to stay black: we use a reactive dye and a cold rinse so the colour holds its depth past the twentieth wash rather than fading to grey.',
    categorySlug: 't-shirts',
    collectionSlugs: ['minimal', 'essentials'],
    price: 999,
    mrp: 1299,
    colors: [BLACK, CHARCOAL],
    sizes: TEE_SIZES,
    fit: 'regular',
    tags: ['tee', 'black', 'minimal', 'essentials'],
    highlights: ['Reactive-dyed for colour depth', 'Set-in sleeve', 'Tuckable length'],
    isBestSeller: true,
    soldCount: 531,
  },
  {
    name: 'HUMOVARE Red Label Oversized Tee',
    shortDescription: 'Our signature red, printed heavy, cut oversized.',
    description:
      'The Red Label is the loudest thing we make, and it earns it. The print is laid down in a high-density plastisol so it sits slightly proud of the fabric, and it is cured twice so it will not crack along the fold. Underneath is the same 240 GSM oversized body as the Core Tee, so the volume and the shoulder line are identical.',
    categorySlug: 't-shirts',
    collectionSlugs: ['graphic-tees', 'oversized', 'streetwear'],
    price: 1499,
    mrp: 1999,
    colors: [RED, BLACK, WHITE],
    sizes: TEE_SIZES,
    fit: 'oversized',
    tags: ['graphic', 'red', 'oversized', 'statement'],
    highlights: ['High-density plastisol print', 'Double-cured for crack resistance', 'Oversized body'],
    isFeatured: true,
    isNewDrop: true,
    soldCount: 196,
  },
  {
    name: 'HUMOVARE Structured Overshirt',
    shortDescription: 'A heavyweight cotton twill overshirt that works as a light jacket.',
    description:
      'Somewhere between a shirt and a jacket, the Structured Overshirt is cut from a 280 GSM cotton twill with enough body to hold a square shoulder. Two chest pockets, corozo buttons and a straight hem mean it layers over a tee without riding up. We finished it with a garment wash so it arrives soft instead of board-stiff.',
    categorySlug: 'shirts',
    collectionSlugs: ['minimal'],
    price: 2499,
    mrp: 3299,
    colors: [OLIVE, CHARCOAL, SAND],
    sizes: TOP_SIZES,
    fit: 'boxy',
    tags: ['overshirt', 'twill', 'layering', 'jacket'],
    highlights: ['280 GSM cotton twill', 'Corozo buttons', 'Garment washed', 'Twin chest pockets'],
    isNewDrop: true,
    soldCount: 87,
  },
  {
    name: 'HUMOVARE Everyday Relaxed Joggers',
    shortDescription: 'Tapered fleece joggers with a clean ankle and zero branding noise.',
    description:
      'Joggers usually fail at the ankle: either they balloon or they grip. Ours taper from the knee into a short rib cuff, so the line stays clean over a trainer. The fabric is the same brushed fleece as the Signature Hoodie, which means the two can be worn together without a shade mismatch. Side seam pockets are bagged in cotton, not mesh.',
    categorySlug: 'bottom-wear',
    collectionSlugs: ['essentials', 'streetwear'],
    price: 1899,
    mrp: 2499,
    colors: [CHARCOAL, BLACK, OLIVE],
    sizes: TOP_SIZES,
    fit: 'relaxed',
    tags: ['joggers', 'fleece', 'bottom-wear', 'everyday'],
    highlights: ['Tapered leg', 'Cotton-bagged pockets', 'Drawcord waist', 'Matches the Signature Hoodie'],
    isBestSeller: true,
    soldCount: 243,
  },
  {
    name: 'HUMOVARE Minimal Crew Tee',
    shortDescription: 'A quiet, mid-weight crew in colours that do not compete.',
    description:
      'The Minimal Crew is the piece you reach for when the rest of the outfit is doing the talking. Mid-weight at 210 GSM, cut regular through the chest with a slightly narrowed sleeve, and offered only in colours that sit back: bone, sand and charcoal. No print, no patch, no logo on the outside.',
    categorySlug: 't-shirts',
    collectionSlugs: ['minimal', 'essentials'],
    price: 1099,
    mrp: 1499,
    colors: [BONE, SAND, CHARCOAL],
    sizes: TEE_SIZES,
    fit: 'regular',
    tags: ['minimal', 'tee', 'neutral', 'essentials'],
    highlights: ['210 GSM jersey', 'No exterior branding', 'Narrowed sleeve'],
    isNewDrop: true,
    soldCount: 134,
  },
  {
    name: 'HUMOVARE Heavyweight Graphic Tee',
    shortDescription: 'A full-back print on a 250 GSM body, cured to survive the wash.',
    description:
      'The back print runs nearly shoulder to hem, which is a hard thing to do without the fabric going stiff. We print in water-based ink so it soaks into the cotton rather than sitting on top of it, which keeps the panel soft and breathable. Front carries only a small chest mark.',
    categorySlug: 't-shirts',
    collectionSlugs: ['graphic-tees', 'streetwear'],
    price: 1599,
    mrp: 2199,
    colors: [BLACK, WHITE],
    sizes: TEE_SIZES,
    fit: 'oversized',
    tags: ['graphic', 'print', 'streetwear', 'back-print'],
    highlights: ['Water-based ink', 'Full-back panel', 'Stays breathable'],
    soldCount: 165,
  },
  {
    name: 'HUMOVARE Utility Cargo Pants',
    shortDescription: 'Six pockets, a ripstop shell and a taper that stops it looking like workwear.',
    description:
      'Cargos go wrong when the pockets swallow the leg. Ours are set flat against a ripstop cotton shell and angled slightly forward so they sit rather than bulge. The leg tapers below the knee and finishes with an internal drawcord, so it can be worn stacked or cinched.',
    categorySlug: 'bottom-wear',
    collectionSlugs: ['streetwear'],
    price: 2599,
    mrp: 3499,
    colors: [OLIVE, BLACK, SAND],
    sizes: WAIST_SIZES,
    fit: 'relaxed',
    tags: ['cargo', 'utility', 'ripstop', 'bottom-wear'],
    highlights: ['Ripstop cotton shell', 'Six flat-set pockets', 'Internal hem drawcord'],
    soldCount: 118,
  },
  {
    name: 'HUMOVARE Poplin Resort Shirt',
    shortDescription: 'An open-collar poplin shirt with a relaxed body and a clean drape.',
    description:
      'Cut with an open camp collar and a boxy body, this is the shirt for the part of the evening that happens outdoors. The poplin is fine but not sheer, and it is mercerised so it keeps a low sheen without feeling synthetic. Buttons are matte to keep the whole thing quiet.',
    categorySlug: 'shirts',
    collectionSlugs: ['minimal'],
    price: 1999,
    mrp: 2699,
    colors: [BONE, SLATE, BLACK],
    sizes: TOP_SIZES,
    fit: 'boxy',
    tags: ['shirt', 'poplin', 'resort', 'camp-collar'],
    highlights: ['Open camp collar', 'Mercerised poplin', 'Matte buttons'],
    isNewDrop: true,
    soldCount: 74,
  },
  {
    name: 'HUMOVARE Zip-Through Hoodie',
    shortDescription: 'A mid-weight zip hoodie with a metal pull and a flat-lock finish.',
    description:
      'Lighter than the Signature at 320 GSM, so it works as a mid-layer rather than an outer. The zip runs on a metal track with a moulded pull that will not rattle, and the seams are flat-locked so nothing rubs under a bag strap. Pockets are set into the seam rather than patched on.',
    categorySlug: 'hoodies',
    collectionSlugs: ['essentials'],
    price: 2399,
    mrp: 2999,
    colors: [CHARCOAL, BLACK, OLIVE],
    sizes: TOP_SIZES,
    fit: 'regular',
    tags: ['hoodie', 'zip', 'mid-layer'],
    highlights: ['Metal zip track', 'Flat-locked seams', 'Seam-set pockets'],
    soldCount: 152,
  },
  {
    name: 'HUMOVARE Terry Shorts',
    shortDescription: 'Loopback terry shorts cut just above the knee.',
    description:
      'The same loopback cotton as the Zip-Through, cut into a short that finishes just above the knee. Elasticated waist with a flat drawcord that will not twist in the channel, and a deep enough pocket to actually hold a phone. Made for the part of summer spent doing nothing in particular.',
    categorySlug: 'bottom-wear',
    collectionSlugs: ['essentials'],
    price: 1399,
    mrp: 1899,
    colors: [CHARCOAL, SAND, BLACK],
    sizes: TOP_SIZES,
    fit: 'regular',
    tags: ['shorts', 'terry', 'summer', 'bottom-wear'],
    highlights: ['Flat non-twist drawcord', 'Deep set pockets', 'Above-knee length'],
    soldCount: 143,
  },
  {
    name: 'HUMOVARE Contrast Panel Tee',
    shortDescription: 'A colour-blocked tee with a red panel cut across the chest.',
    description:
      'A single panel of signature red runs across the chest and down the sleeve, joined with a flat-locked seam so the transition sits flush. Built on the regular body rather than the oversized one, which keeps the panel reading as a line instead of a block.',
    categorySlug: 't-shirts',
    collectionSlugs: ['streetwear', 'graphic-tees'],
    price: 1399,
    mrp: 1899,
    colors: [BLACK, WHITE],
    sizes: TEE_SIZES,
    fit: 'regular',
    tags: ['panel', 'colour-block', 'red', 'streetwear'],
    highlights: ['Flush flat-locked panel seam', 'Signature red contrast', 'Regular body'],
    isNewDrop: true,
    soldCount: 88,
  },
  {
    name: 'HUMOVARE Movement Print Tee',
    shortDescription: 'The walking mark, printed oversized across the chest.',
    description:
      'The figure inside our H, blown up and printed large. It is a single-colour discharge print, which bleaches the dye out of the cotton and lays the ink into the weave rather than on top of it — so the graphic feels like nothing at all under your hand and will not crack. Cut on the 240 GSM oversized body.',
    categorySlug: 't-shirts',
    collectionSlugs: ['graphic-tees', 'oversized'],
    price: 1449,
    mrp: 1949,
    colors: [BLACK, OXBLOOD, WHITE],
    sizes: TEE_SIZES,
    fit: 'oversized',
    tags: ['graphic', 'print', 'movement', 'oversized'],
    highlights: ['Discharge print', 'Sits flush with the weave', 'Oversized body'],
    isNewDrop: true,
    isFeatured: true,
    soldCount: 118,
  },
  {
    name: 'HUMOVARE Oxblood Heavy Hoodie',
    shortDescription: 'The Signature build in our deepest red.',
    description:
      'Same 400 GSM brushed fleece and double-layer hood as the Signature, dyed in oxblood — a red dark enough to wear like a neutral. Piece-dyed rather than yarn-dyed, so the colour sits slightly uneven across the loop and deepens with age instead of flattening.',
    categorySlug: 'hoodies',
    collectionSlugs: ['streetwear', 'oversized'],
    price: 2899,
    mrp: 3899,
    colors: [OXBLOOD, BLACK],
    sizes: TOP_SIZES,
    fit: 'oversized',
    tags: ['hoodie', 'oxblood', 'fleece', 'heavy'],
    highlights: ['Piece-dyed oxblood', '400 GSM brushed fleece', 'Double-layer hood'],
    isNewDrop: true,
    soldCount: 96,
  },
  {
    name: 'HUMOVARE Stacked Logo Tee',
    shortDescription: 'Wordmark stacked and set small, high on the chest.',
    description:
      'A restrained one for the range: the HUMOVARE wordmark stacked over three lines and set small, sitting high on the left chest. Everything else is left alone. Mid-weight 220 GSM jersey on the regular body, so it works under an overshirt without bulking at the shoulder.',
    categorySlug: 't-shirts',
    collectionSlugs: ['minimal', 'essentials'],
    price: 1199,
    mrp: 1599,
    colors: [WHITE, BLACK, CHARCOAL],
    sizes: TEE_SIZES,
    fit: 'regular',
    tags: ['logo', 'tee', 'minimal', 'everyday'],
    highlights: ['Small chest placement', '220 GSM jersey', 'Layers flat under a shirt'],
    isBestSeller: true,
    soldCount: 207,
  },
  {
    name: 'HUMOVARE Washed Straight Trousers',
    shortDescription: 'A straight-leg cotton trouser with a soft, lived-in hand.',
    description:
      'Cut straight from the hip with no taper, in a mid-weight cotton that has been garment-washed twice so it arrives already soft. The waistband is faced rather than elasticated, which keeps the front flat, and the hem is deep enough to take up if you want them shorter.',
    categorySlug: 'bottom-wear',
    collectionSlugs: ['minimal', 'essentials'],
    price: 2299,
    mrp: 2999,
    colors: [BLACK, SAND, OLIVE],
    sizes: WAIST_SIZES,
    fit: 'regular',
    tags: ['trousers', 'straight', 'washed', 'bottom-wear'],
    highlights: ['Twice garment-washed', 'Faced waistband', 'Deep hem allowance'],
    soldCount: 71,
  },
  {
    name: 'HUMOVARE Grid Check Shirt',
    shortDescription: 'A fine grid check in brushed cotton, cut for a relaxed shoulder.',
    description:
      'The check is woven, not printed, so the pattern runs through the cloth and the reverse reads as a soft shadow of the face. Brushed on both sides for warmth without weight. The shoulder sits slightly wide, which lets it work open over a tee as easily as buttoned on its own.',
    categorySlug: 'shirts',
    collectionSlugs: ['streetwear'],
    price: 2199,
    mrp: 2899,
    colors: [OXBLOOD, CHARCOAL, OLIVE],
    sizes: TOP_SIZES,
    fit: 'relaxed',
    tags: ['shirt', 'check', 'flannel', 'brushed'],
    highlights: ['Yarn-dyed woven check', 'Double-brushed', 'Relaxed shoulder'],
    soldCount: 64,
  },
];

export const careInstructions = CARE;
