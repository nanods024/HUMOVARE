import crypto from 'node:crypto';
import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { env } from '../config/env.js';
import { MediaAsset } from '../models/MediaAsset.js';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { HomepageSection } from '../models/HomepageSection.js';
import { Collection } from '../models/Collection.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { destroyImage } from './cloudinary.service.js';

/** Folders the admin may upload into. An arbitrary path is never accepted. */
export const MEDIA_FOLDERS = Object.freeze([
  'products',
  'categories',
  'homepage',
  'banners',
  'community',
  'collections',
]);

/**
 * Folders that also show older uploads kept elsewhere: collection images used
 * to be uploaded to /banners, and they still belong under Collections.
 */
const FOLDER_ALIASES = Object.freeze({
  collections: ['collections', 'banners'],
});

/**
 * Issues a short-lived signature for a direct browser→Cloudinary upload.
 *
 * The API secret is used to compute the signature and never leaves the server;
 * the browser receives only the signature, timestamp and public API key. The
 * folder is chosen from a fixed list here rather than taken from the client,
 * so an upload cannot be redirected somewhere unexpected.
 */
export function createUploadSignature({ folder = 'products' }) {
  if (!isCloudinaryConfigured()) {
    throw ApiError.internal('Image uploads are not configured on this environment');
  }

  if (!MEDIA_FOLDERS.includes(folder)) {
    throw ApiError.badRequest(`Unknown media folder "${folder}"`);
  }

  const timestamp = Math.round(Date.now() / 1000);
  const targetFolder = `${env.cloudinary.folder}/${folder}`;

  const params = {
    folder: targetFolder,
    timestamp,
    // Cap dimensions on ingest so an enormous original cannot be stored.
    transformation: 'c_limit,w_2000,h_2000',
  };

  const signature = cloudinary.utils.api_sign_request(params, env.cloudinary.apiSecret);

  return {
    signature,
    timestamp,
    folder: targetFolder,
    transformation: params.transformation,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    // The browser must not be trusted to enforce these; Cloudinary does too.
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'avif'],
    maxBytes: 5 * 1024 * 1024,
  };
}

/**
 * Records an asset after Cloudinary confirms the upload.
 *
 * The reported values are verified against Cloudinary's own signature so a
 * client cannot register a public id it does not own.
 */
export function verifyUploadSignature({ publicId, version, signature }) {
  const expected = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    env.cloudinary.apiSecret,
  );

  const provided = String(signature ?? '');
  const matches =
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!matches) throw ApiError.badRequest('Upload could not be verified');
}

export async function registerAsset(payload, adminId) {
  const asset = await MediaAsset.findOneAndUpdate(
    { publicId: payload.publicId },
    {
      $set: {
        secureUrl: payload.secureUrl,
        width: payload.width ?? null,
        height: payload.height ?? null,
        format: payload.format ?? '',
        bytes: payload.bytes ?? 0,
        resourceType: payload.resourceType ?? 'image',
        folder: payload.folder ?? '',
        altText: payload.altText ?? '',
        uploadedBy: adminId ?? null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  return asset;
}

export async function listAssets(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.folder) {
    // Only known folders, matched exactly — never a pattern built from input.
    if (!MEDIA_FOLDERS.includes(query.folder)) throw ApiError.badRequest(`Unknown media folder "${query.folder}"`);
    const names = FOLDER_ALIASES[query.folder] ?? [query.folder];
    filter.folder = { $in: names.map((name) => `${env.cloudinary.folder}/${name}`) };
  }
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [{ publicId: pattern }, { altText: pattern }];
  }

  const [assets, total] = await Promise.all([
    MediaAsset.find(filter)
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MediaAsset.countDocuments(filter),
  ]);

  return { assets, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function updateAsset(id, payload) {
  const asset = await MediaAsset.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean();
  if (!asset) throw ApiError.notFound('Media asset not found');
  return asset;
}

/**
 * Counts live references to an asset across products, categories and home
 * page sections — the check that stops the library quietly breaking a
 * published page.
 */
export async function countUsage(publicId, url = '') {
  // Some screens save an image by URL alone, so match on either.
  const byImage = (field) => ({
    $or: [{ [`${field}.publicId`]: publicId }, ...(url ? [{ [`${field}.url`]: url }] : [])],
  });

  const [products, categories, sections, collections] = await Promise.all([
    Product.countDocuments({
      $or: [{ 'images.publicId': publicId }, { 'thumbnail.publicId': publicId }],
    }),
    Category.countDocuments(byImage('image')),
    HomepageSection.countDocuments({
      $or: [{ 'image.publicId': publicId }, { 'mobileImage.publicId': publicId }],
    }),
    Collection.countDocuments(byImage('image')),
  ]);

  return {
    products,
    categories,
    sections,
    collections,
    total: products + categories + sections + collections,
  };
}

/**
 * Deletes an asset from Cloudinary and the library.
 * Refuses while anything still references it unless explicitly forced.
 */
export async function deleteAsset(id, { force = false } = {}) {
  const asset = await MediaAsset.findById(id);
  if (!asset) throw ApiError.notFound('Media asset not found');

  const usage = await countUsage(asset.publicId, asset.secureUrl);

  if (usage.total > 0 && !force) {
    throw ApiError.conflict(
      `This image is still used by ${usage.total} item(s). Remove those references first, or confirm to delete anyway.`,
      { details: usage },
    );
  }

  await destroyImage(asset.publicId);
  await asset.deleteOne();

  return { deleted: true, usage };
}

export default {
  createUploadSignature,
  verifyUploadSignature,
  registerAsset,
  listAssets,
  updateAsset,
  countUsage,
  deleteAsset,
  MEDIA_FOLDERS,
};
