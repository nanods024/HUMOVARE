const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/**
 * Normalises page/limit query params into safe integers so a client cannot
 * ask for 100000 documents in a single call.
 */
export function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), MAX_LIMIT);
  return { page, limit, skip: (page - 1) * limit };
}

export function buildPaginationMeta({ page, limit, total }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    currentPage: page,
    limit,
    totalProducts: total,
    totalItems: total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export default { parsePagination, buildPaginationMeta };
