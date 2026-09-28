/**
 * URL-safe slug generator. SEO URLs are a product decision, so slugs are
 * generated once and then persisted, never recomputed from a renamed title.
 */
export function slugify(input = '') {
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Appends a numeric suffix until the slug is unique for the given model.
 * `excludeId` lets an update keep its own slug.
 */
export async function uniqueSlug(Model, base, excludeId = null) {
  const root = slugify(base) || 'item';
  let candidate = root;
  let suffix = 1;

  while (true) {
    const query = { slug: candidate };
    if (excludeId) query._id = { $ne: excludeId };
    const exists = await Model.exists(query);
    if (!exists) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export default slugify;
