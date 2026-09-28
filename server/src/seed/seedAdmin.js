import { AdminUser } from '../models/AdminUser.js';
import { HomepageSection } from '../models/HomepageSection.js';
import { ShopConfig, SUPPORTED_FILTERS } from '../models/ShopConfig.js';
import { StoreSetting } from '../models/StoreSetting.js';
import { ensureRoles } from '../services/adminUser.service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { ADMIN_ROLES } from '../constants/permissions.js';
import { homepageSections, storeSettings } from './adminData.js';

/**
 * Seeds everything the admin portal needs to be usable on a fresh database:
 * the role catalogue, one super admin, the home page as it currently renders,
 * the shop page defaults and the store settings.
 *
 * Every step is idempotent, so re-running never duplicates content and never
 * overwrites an edit an admin has since made.
 *
 * It also reconciles a database seeded by an older version of this code: a new
 * section is inserted at the position the seed intends rather than tacked on
 * the end, and the shop configuration drops filters the storefront no longer
 * implements. Without that, an upgrade leaves a database that is valid but
 * subtly wrong — a filter panel that renders nothing, a section in the wrong
 * place — and the only fix anyone finds is wiping the data.
 */
export async function seedAdmin({ fresh = false } = {}) {
  if (fresh) {
    logger.warn('--fresh: clearing homepage sections');
    await HomepageSection.deleteMany({});
  }

  const roles = await ensureRoles();
  logger.info(`Seeded ${roles.length} roles`);

  // ── Super admin ───────────────────────────────────────────────────────────
  const email = (process.env.SEED_SUPER_ADMIN_EMAIL || 'owner@humovare.in').toLowerCase();
  // The fallback is for local development only: it is printed in the README,
  // so a production store must never be created with it.
  if (env.isProd && !process.env.SEED_SUPER_ADMIN_PASSWORD) {
    throw new Error('Set SEED_SUPER_ADMIN_PASSWORD before seeding a production database.');
  }
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD || 'Humovare@Admin2025';

  let superAdmin = await AdminUser.findOne({ email });

  if (!superAdmin) {
    superAdmin = new AdminUser({
      name: 'HUMOVARE Owner',
      email,
      role: ADMIN_ROLES.SUPER_ADMIN,
      // A seeded credential is a shared secret until it is replaced.
      mustChangePassword: true,
    });
    await superAdmin.setPassword(password);
    await superAdmin.save();
    logger.info(`Created super admin: ${email}`);
  }

  // ── Home page ─────────────────────────────────────────────────────────────
  let created = 0;

  for (const section of homepageSections) {
    const existing = await HomepageSection.findOne({ key: section.key }).select('_id').lean();
    if (existing) continue;

    // Make room at the seeded position. Appending instead would put a new
    // section at the bottom of a page that already has the admin's ordering,
    // which is never where it belongs.
    await HomepageSection.updateMany(
      { sortOrder: { $gte: section.sortOrder } },
      { $inc: { sortOrder: 1 } },
    );

    await HomepageSection.create({ ...section, updatedBy: superAdmin._id });
    created += 1;
  }

  logger.info(
    `Homepage sections ready — ${created} created, ${homepageSections.length - created} existing`,
  );

  // ── Shop page + store settings ────────────────────────────────────────────
  const shopConfig = await ShopConfig.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { ...ShopConfig.defaults(), updatedBy: superAdmin._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  /**
   * Bring a stored configuration back in step with the code.
   *
   * A filter whose key the sidebar no longer implements renders nothing, and a
   * newly supported one would never appear at all — both look like bugs to
   * whoever is using the admin. Labels, ordering and enabled/disabled state are
   * left alone for every filter that still exists, because those are the
   * admin's decisions.
   */
  const defaults = ShopConfig.defaults().filters;
  const stored = shopConfig.filters ?? [];

  const kept = stored.filter((filter) => SUPPORTED_FILTERS.includes(filter.key));
  const removed = stored.length - kept.length;

  const missing = defaults.filter(
    (candidate) => !kept.some((filter) => filter.key === candidate.key),
  );

  if (removed > 0 || missing.length > 0) {
    shopConfig.filters = [...kept, ...missing];
    await shopConfig.save();
    logger.info(
      `Shop filters reconciled — ${removed} retired, ${missing.length} added`,
    );
  }

  await StoreSetting.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: { key: 'default', ...storeSettings, updatedBy: superAdmin._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  logger.info('Shop configuration and store settings ready');

  return {
    roles: roles.length,
    superAdmin: email,
    sections: homepageSections.length,
  };
}

export default seedAdmin;
