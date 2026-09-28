import { z } from 'zod';
import { objectId, customerEmail } from './common.validator.js';
import { FEEDBACK_STATUSES, FEEDBACK_TOPICS } from '../models/Feedback.js';

export const submitFeedbackSchema = {
  body: z.object({
    name: z.string().trim().min(2, 'Tell us your name').max(80),
    email: customerEmail,
    topic: z.enum(FEEDBACK_TOPICS).optional(),
    subject: z.string().trim().max(140).optional(),
    message: z.string().trim().min(10, 'A little more detail, please').max(2000),
  }),
};

export const listFeedbackSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(FEEDBACK_STATUSES).optional(),
    topic: z.enum(FEEDBACK_TOPICS).optional(),
    search: z.string().trim().max(120).optional(),
  }),
};

export const updateFeedbackSchema = {
  params: z.object({ id: objectId }),
  body: z
    .object({
      status: z.enum(FEEDBACK_STATUSES).optional(),
      note: z.string().trim().max(1000).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' }),
};
