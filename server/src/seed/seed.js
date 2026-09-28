/**
 * Seeds categories, a demo customer, an admin and the HUMOVARE catalogue.
 *
 *   npm run seed          # upsert — safe to re-run
 *   npm run seed:fresh    # wipe catalogue collections first
 *
 * Product imagery: if Cloudinary is configured the seeder can upload local
 * files, but by default it writes deterministic placeholder URLs so the
 * storefront looks complete without any image pipeline set up.
 */
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { env, assertEnv } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { slugify } from '../utils/slugify.js';
import { ensureIndexesFor } from '../utils/indexes.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { Cart } from '../models/Cart.js';
import { Wishlist } from '../models/Wishlist.js';
import { Order } from '../models/Order.js';
import { Address } from '../models/Address.js';
import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { Role } from '../models/Role.js';
import { AuditLog } from '../models/AuditLog.js';
import { HomepageSection } from '../models/HomepageSection.js';
import { ShopConfig } from '../models/ShopConfig.js';
import { Collection } from '../models/Collection.js';
import { MediaAsset } from '../models/MediaAsset.js';
import { InventoryTransaction } from '../models/InventoryTransaction.js';
import { StoreSetting } from '../models/StoreSetting.js';
import { Feedback } from '../models/Feedback.js';
import { EmailEvent } from '../models/EmailEvent.js';
import { ROLES } from '../constants/index.js';
import { categories, products, careInstructions } from './data.js';
import { seedAdmin } from './seedAdmin.js';

const FRESH = process.argv.includes('--fresh');

/**
 * Deterministic placeholder imagery, keyed by slug so a given product always
 * gets the same photographs across reseeds. Swap SEED_IMAGE_BASE for a
 * Cloudinary folder once real photography exists.
 */
const IMAGE_BASE = process.env.SEED_IMAGE_BASE || 'https://picsum.photos/seed';

function imagesFor(slug, name, count = 4) {
  return Array.from({ length: count }, (_, index) => ({
    url: `${IMAGE_BASE}/${slug}-${index + 1}/1000/1250`,
    publicId: '',
    alt: `${name} — view ${index + 1}`,
    width: 1000,
    height: 1250,
  }));
}

/**
 * Builds the size x colour matrix. Stock is varied deliberately so the UI has
 * in-stock, low-stock and sold-out states to render without hand-editing data.
 */
function buildVariants(product) {
  const variants = [];

  product.colors.forEach((color, colorIndex) => {
    product.sizes.forEach((size, sizeIndex) => {
      const seed = (colorIndex * 7 + sizeIndex * 3) % 11;
      let stock = 6 + seed * 2;

      if (seed === 0) stock = 0; // a genuinely sold-out variant
      if (seed === 4) stock = 3; // a low-stock variant

      variants.push({
        sku: `HV-${slugify(product.name).slice(0, 16).toUpperCase()}-${color.slug.toUpperCase()}-${size}`,
        size,
        color: color.name,
        colorSlug: color.slug,
        stock,
        price: null,
      });
    });
  });

  return variants;
}

async function seedCategories() {
  const bySlug = new Map();

  for (const category of categories) {
    const doc = await Category.findOneAndUpdate(
      { slug: category.slug },
      {
        $set: {
          ...category,
          isActive: true,
          showInNav: category.showInNav ?? true,
          image: category.image ?? {
            url: `${IMAGE_BASE}/category-${category.slug}/900/1100`,
            publicId: '',
            alt: `${category.name} at HUMOVARE`,
            width: 900,
            height: 1100,
          },
          seo: {
            title: `${category.name} | HUMOVARE`,
            description: category.description || `Shop ${category.name} at HUMOVARE.`,
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    bySlug.set(category.slug, doc);
  }

  logger.info(`Seeded ${bySlug.size} categories`);
  return bySlug;
}

async function seedProducts(categoryMap) {
  let created = 0;
  let updated = 0;

  for (const entry of products) {
    const category = categoryMap.get(entry.categorySlug);
    if (!category) {
      logger.warn(`Skipping "${entry.name}" — unknown category ${entry.categorySlug}`);
      continue;
    }

    const slug = slugify(entry.name);
    const collectionIds = (entry.collectionSlugs || [])
      .map((collectionSlug) => categoryMap.get(collectionSlug)?._id)
      .filter(Boolean);

    const images = imagesFor(slug, entry.name);
    const variants = buildVariants(entry);

    const payload = {
      name: entry.name,
      slug,
      description: entry.description,
      shortDescription: entry.shortDescription,
      brand: 'HUMOVARE',
      category: category._id,
      collections: collectionIds,
      gender: entry.gender ?? 'men',
      price: entry.price,
      mrp: entry.mrp,
      colors: entry.colors,
      variants,
      sizes: entry.sizes,
      fit: entry.fit,
      careInstructions,
      highlights: entry.highlights || [],
      images,
      thumbnail: images[0],
      tags: entry.tags || [],
      soldCount: entry.soldCount ?? 0,
      rating: {
        average: Number((4.1 + ((entry.soldCount ?? 0) % 9) / 10).toFixed(1)),
        count: Math.max(6, Math.round((entry.soldCount ?? 0) / 7)),
      },
      isFeatured: Boolean(entry.isFeatured),
      isBestSeller: Boolean(entry.isBestSeller),
      isNewDrop: Boolean(entry.isNewDrop),
      isActive: true,
      seo: {
        title: `${entry.name} | HUMOVARE`,
        description: entry.shortDescription,
      },
    };

    const existing = await Product.findOne({ slug });

    if (existing) {
      existing.set(payload);
      await existing.save(); // save() so the derived-field hook runs
      updated += 1;
    } else {
      await Product.create(payload);
      created += 1;
    }
  }

  logger.info(`Seeded products — ${created} created, ${updated} updated`);
}

async function seedUsers() {
  // A demo shopper with a published password has no place in a live store.
  if (env.isProd) {
    logger.info('Production: skipping the demo customer account');
    return;
  }

  // Admins live in AdminUser (see seedAdmin.js), never here: a customer
  // account must not carry admin powers.
  const accounts = [
    {
      name: 'Demo Customer',
      email: 'demo@humovare.com',
      password: 'Humovare@2025',
      role: ROLES.CUSTOMER,
    },
  ];

  for (const account of accounts) {
    const existing = await User.findOne({ email: account.email });
    if (existing) continue;

    const user = new User({ name: account.name, email: account.email, role: account.role });
    await user.setPassword(account.password);
    await user.save();
    logger.info(`Created ${account.role}: ${account.email}`);
  }

}

/**
 * Seeds the database against an already-open connection.
 * Exported so tests and tooling can run it in-process.
 */
export async function seedDatabase({ fresh = false } = {}) {
  if (fresh) {
    logger.warn('--fresh: clearing catalogue, carts and wishlists');
    await Promise.all([
      Product.deleteMany({}),
      Category.deleteMany({}),
      Cart.deleteMany({}),
      Wishlist.deleteMany({}),
    ]);
  }

  // Indexes are created before the bulk load so the unique slug index is
  // already enforcing uniqueness while products are written.
  await ensureIndexesFor([
    Product, Category, User, Order, Address, Cart, Wishlist,
    AdminUser, AdminSession, Role, AuditLog,
    HomepageSection, ShopConfig, Collection, MediaAsset, InventoryTransaction, StoreSetting,
    Feedback, EmailEvent,
  ]);
  logger.info('Indexes synchronised');

  const categoryMap = await seedCategories();
  await seedProducts(categoryMap);
  await seedUsers();

  // Roles, the super admin, and the storefront content the admin manages.
  await seedAdmin({ fresh });

  const [productCount, categoryCount] = await Promise.all([
    Product.countDocuments(),
    Category.countDocuments(),
  ]);

  logger.info(`Seed complete — ${productCount} products across ${categoryCount} categories`);
  return { products: productCount, categories: categoryCount };
}

/** CLI entry point. */
async function run() {
  assertEnv();
  // autoIndex off: seedDatabase manages indexes explicitly.
  await connectDB({ autoIndex: false });
  return seedDatabase({ fresh: FRESH });
}

// Only run when invoked as a script — importing this module (tests, tooling)
// must not open a connection or exit the process.
const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  run()
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Seed failed', { message: error.message, stack: error.stack });
      await mongoose.connection.close().catch(() => {});
      process.exit(1);
    });
}
