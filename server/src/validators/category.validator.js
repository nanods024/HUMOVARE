import { z } from 'zod';
import { objectId, slug } from './common.validator.js';
import { CATEGORY_TYPES } from '../constants/index.js';

const categoryBody = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slug.optional(),
  description: z.string().trim().max(600).optional(),
  type: z.enum(CATEGORY_TYPES).optional(),
  parent: objectId.nullable().optional(),
  image: z
    .object({
      url: z.string().url(),
      publicId: z.string().optional(),
      alt: z.string().max(160).optional(),
    })
    .nullable()
    .optional(),
  isVirtual: z.boolean().optional(),
  showInNav: z.boolean().optional(),
  displayOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const createCategorySchema = { body: categoryBody };

export const updateCategorySchema = {
  params: z.object({ id: objectId }),
  body: categoryBody.partial(),
};

export const listCategoriesSchema = {
  query: z.object({
    type: z.enum(CATEGORY_TYPES).optional(),
    nav: z.enum(['true', 'false']).optional(),
    manage: z.enum(['true', 'false']).optional(),
  }),
};
