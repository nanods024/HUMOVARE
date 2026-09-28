import { toDotPaths } from '../utils/dotPaths.js';
import { ShopConfig } from '../models/ShopConfig.js';

/**
 * The shop page configuration, created on first read.
 *
 * A singleton keyed on a fixed string, so an upsert can never produce a second
 * copy no matter how many requests race.
 */
export async function getShopConfig() {
  const existing = await ShopConfig.findOne({ key: 'default' }).lean();
  if (existing) return existing;

  const created = await ShopConfig.findOneAndUpdate(
    { key: 'default' },
    { $setOnInsert: ShopConfig.defaults() },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return created;
}

/**
 * The shape the storefront consumes: only enabled filters and sort options,
 * already ordered, so the client renders the list as given without filtering.
 */
export async function getPublicShopConfig() {
  const config = await getShopConfig();

  const filters = (config.filters ?? [])
    .filter((filter) => filter.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ key, label, defaultOpen }) => ({ key, label, defaultOpen }));

  const sortOptions = (config.sortOptions ?? [])
    .filter((option) => option.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ value, label }) => ({ value, label }));

  // If the configured default has been disabled, fall back to the first
  // enabled option rather than sorting by something the UI cannot show.
  const defaultSort = sortOptions.some((option) => option.value === config.defaultSort)
    ? config.defaultSort
    : (sortOptions[0]?.value ?? 'featured');

  return {
    title: config.title,
    description: config.description,
    filters,
    sortOptions,
    defaultSort,
    pageSize: config.pageSize,
    emptyTitle: config.emptyTitle,
    emptyDescription: config.emptyDescription,
    seo: config.seo ?? { title: '', description: '' },
  };
}

export async function updateShopConfig(payload, adminId) {
  const before = await getShopConfig();

  const updated = await ShopConfig.findOneAndUpdate(
    { key: 'default' },
    { $set: { ...toDotPaths(payload, ['seo']), updatedBy: adminId } },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  return { before, after: updated };
}

export default { getShopConfig, getPublicShopConfig, updateShopConfig };
