import * as productService from '../services/product.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { cached, TTL } from '../utils/publicCache.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export const listProducts = asyncHandler(async (req, res) => {
  const { products, pagination } = await productService.listProducts(req.validatedQuery ?? {});

  return sendSuccess(res, {
    message: 'Products fetched successfully',
    data: { products, pagination },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  const related = await productService.getRelatedProducts(product);

  return sendSuccess(res, {
    message: 'Product fetched successfully',
    data: { product, related },
  });
});

export const searchProducts = asyncHandler(async (req, res) => {
  const { q, limit } = req.validatedQuery;
  const products = await productService.suggestProducts(q, limit);

  return sendSuccess(res, {
    message: 'Search results fetched',
    data: { query: q, products, count: products.length },
  });
});

export const getHomeFeed = asyncHandler(async (_req, res) => {
  const rails = await cached('home-feed', TTL.catalogue, () => productService.getHomeRails());
  return sendSuccess(res, { message: 'Home feed fetched', data: rails });
});

export const getFacets = asyncHandler(async (req, res) => {
  // Only these two parameters shape the facets, so only they key the cache.
  const scope = { category: req.query.category || undefined, collection: req.query.collection || undefined };
  const facets = await cached(`facets:${scope.category ?? ''}|${scope.collection ?? ''}`, TTL.catalogue, () =>
    productService.getFilterFacets(scope),
  );
  return sendSuccess(res, { message: 'Filters fetched', data: facets });
});

/** Powers the "recently viewed" rail — the client owns the id list. */
export const getProductsByIds = asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((id) => id.trim())
    // The list comes from the shopper's own storage; one stale or mangled id
    // must not fail the whole "recently viewed" rail.
    .filter((id) => OBJECT_ID.test(id));

  const products = await productService.getProductsByIds(ids);
  return sendSuccess(res, { message: 'Products fetched', data: { products } });
});

