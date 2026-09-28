import { Feedback } from '../models/Feedback.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';

/**
 * Records a contact-form message.
 *
 * Nothing here is rendered on the storefront, so the message is stored as
 * written and escaped at display time. The sender's own account is attached
 * when they happened to be signed in, which is what lets an admin find their
 * orders without asking for an order number.
 */
export async function submitFeedback(payload, user) {
  return Feedback.create({
    name: payload.name,
    email: payload.email,
    topic: payload.topic ?? 'general',
    subject: payload.subject ?? '',
    message: payload.message,
    user: user?._id ?? null,
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function listFeedback(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.topic) filter.topic = query.topic;
  if (query.search) {
    const term = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: term }, { email: term }, { subject: term }, { message: term }];
  }

  const [messages, total, unread] = await Promise.all([
    Feedback.find(filter)
      .populate('user', 'name email')
      .populate('handledBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Feedback.countDocuments(filter),
    Feedback.countDocuments({ status: 'new' }),
  ]);

  return { messages, unread, pagination: buildPaginationMeta({ page, limit, total }) };
}

export async function updateFeedback(id, payload, adminId) {
  const message = await Feedback.findById(id);
  if (!message) throw ApiError.notFound('Message not found');

  const before = { status: message.status, note: message.note };

  if (payload.status) message.status = payload.status;
  if (payload.note !== undefined) message.note = payload.note;
  message.handledBy = adminId;
  message.handledAt = new Date();

  await message.save();
  return { before, after: message.toObject() };
}

export async function deleteFeedback(id) {
  const message = await Feedback.findById(id);
  if (!message) throw ApiError.notFound('Message not found');

  await message.deleteOne();
  return { deleted: true };
}

export default { submitFeedback, listFeedback, updateFeedback, deleteFeedback };
