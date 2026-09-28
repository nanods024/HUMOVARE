import { z } from 'zod';
import { objectId, slug } from './common.validator.js';
import { GENDERS, FITS, PRODUCT_SORTS } from '../constants/index.js';

/** Accepts either `?size=L&size=M` or `?size=L,M`. */
const csv = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    (Array.isArray(value) ? value : value.split(','))
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const listProductsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
    category: z.string().trim().optional(),
    collection: z.string().trim().optional(),
    collections: csv.optional(),
    gender: z.enum(GENDERS).optional(),
    size: csv.optional(),
    color: csv.optional(),
    fit: csv.optional(),
    tag: csv.optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    inStock: z.enum(['true', 'false']).optional(),
    onSale: z.enum(['true', 'false']).optional(),
    search: z.string().trim().max(120).optional(),
    sort: z.enum(Object.keys(PRODUCT_SORTS)).optional(),
  }),
};

export const searchSchema = {
  query: z.object({
    q: z.string().trim().min(1, 'Enter something to search for').max(120),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
};

const colorInput = z.object({
  name: z.string().trim().min(1, 'Give every colour a name'),
  // Derived from the name on save; an empty one (a colour just added in the
  // form) is the same as not sending it.
  slug: z.preprocess((value) => (value === '' ? undefined : value), z.string().trim().min(1).optional()),
  hex: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour like #B71C1C'),
});

const variantInput = z.object({
  // Sent back by the editor so an edit keeps the variant's identity.
  _id: objectId.optional(),
  sku: z.string().trim().min(1).optional(),
  size: z.string().trim().min(1),
  color: z.string().trim().min(1),
  colorSlug: z.string().trim().min(1).optional(),
  stock: z.coerce.number().int().min(0).default(0),
  price: z.coerce.number().min(0).nullable().optional(),
});

const imageInput = z.object({
  url: z.string().url('Image URL is invalid'),
  publicId: z.string().trim().optional(),
  alt: z.string().trim().max(160).optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
});

const productBody = z.object({
  name: z.string().trim().min(2).max(140),
  slug: slug.optional(),
  description: z.string().trim().min(10).max(4000),
  shortDescription: z.string().trim().max(300).optional(),
  brand: z.string().trim().max(60).optional(),
  category: objectId,
  collections: z.array(objectId).optional(),
  gender: z.enum(GENDERS),
  price: z.coerce.number().min(0),
  mrp: z.coerce.number().min(0),
  colors: z.array(colorInput).min(1, 'Add at least one colour'),
  variants: z.array(variantInput).min(1, 'Add at least one variant'),
  fit: z.enum(FITS).optional(),
  careInstructions: z.array(z.string().trim()).optional(),
  highlights: z.array(z.string().trim()).optional(),
  images: z.array(imageInput).optional(),
  thumbnail: imageInput.nullable().optional(),
  tags: z.array(z.string().trim()).optional(),
  isFeatured: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isNewDrop: z.boolean().optional(),
  isDesignerExclusive: z.boolean().optional(),
  isActive: z.boolean().optional(),
  seo: z.object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(180).optional() }).optional(),
});

export const createProductSchema = {
  body: productBody.refine((data) => data.mrp >= data.price, {
    message: 'MRP cannot be lower than the selling price',
    path: ['mrp'],
  }),
};

export const updateProductSchema = {
  params: z.object({ id: objectId }),
  body: productBody.partial(),
};
