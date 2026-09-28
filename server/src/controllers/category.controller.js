import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { cached, TTL } from '../utils/publicCache.js';

export const listCategories = asyncHandler(async (req, res) => {
  // `manage` includes hidden categories — admin only, never on the public route.
  const { manage: _manage, ...query } = req.validatedQuery ?? {};
  const key = `categories:${JSON.stringify(Object.entries(query).sort())}`;
  const categories = await cached(key, TTL.config, () => categoryService.listCategories(query));
  return sendSuccess(res, {
    message: 'Categories fetched successfully',
    data: { categories, count: categories.length },
  });
});

export const getNavigation = asyncHandler(async (_req, res) => {
  const navigation = await cached('navigation', TTL.config, () => categoryService.getNavigationTree());
  return sendSuccess(res, { message: 'Navigation fetched', data: navigation });
});

export const getCategory = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const category = await cached(`category:${slug}`, TTL.config, () => categoryService.getCategoryBySlug(slug));
  return sendSuccess(res, { message: 'Category fetched successfully', data: { category } });
});

