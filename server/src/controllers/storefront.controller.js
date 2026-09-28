import * as homepageService from '../services/homepage.service.js';
import * as shopConfigService from '../services/shopConfig.service.js';
import * as collectionService from '../services/collection.service.js';
import { publicStoreSettings } from '../services/storeSettings.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { cached, TTL } from '../utils/publicCache.js';

/**
 * Public CMS endpoints.
 *
 * These serve only published content — an unpublished or expired section is
 * invisible here regardless of what the admin UI shows.
 */

export const getHomepage = asyncHandler(async (_req, res) => {
  const sections = await cached('homepage', TTL.catalogue, () => homepageService.getPublishedHomepage());
  return sendSuccess(res, { message: 'Homepage fetched', data: { sections } });
});

export const getShopConfig = asyncHandler(async (_req, res) => {
  const config = await cached('shop-config', TTL.config, () => shopConfigService.getPublicShopConfig());
  return sendSuccess(res, { message: 'Shop configuration fetched', data: { config } });
});

/** Contact details and shop rules the storefront shows — edited in admin Settings. */
export const getPublicSettings = asyncHandler(async (_req, res) =>
  sendSuccess(res, { message: 'Settings fetched', data: { settings: publicStoreSettings() } }),
);

export const listCollections = asyncHandler(async (_req, res) => {
  const collections = await cached('collections', TTL.catalogue, () => collectionService.listPublishedCollections());
  return sendSuccess(res, { message: 'Collections fetched', data: { collections } });
});

export const getCollection = asyncHandler(async (req, res) => {
  const { slug } = req.params;
  const collection = await cached(`collection:${slug}`, TTL.catalogue, () => collectionService.getPublishedCollection(slug));
  return sendSuccess(res, { message: 'Collection fetched', data: { collection } });
});
