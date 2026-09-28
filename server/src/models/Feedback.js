import mongoose from 'mongoose';

export const FEEDBACK_STATUSES = Object.freeze(['new', 'read', 'replied', 'archived']);
export const FEEDBACK_TOPICS = Object.freeze(['general', 'order', 'product', 'returns', 'wholesale']);

/**
 * A message from the contact form.
 *
 * Kept separate from reviews: this is private correspondence, never rendered
 * on the storefront, so it has an inbox rather than a moderation queue. The
 * sender may be signed in or not, which is why the name and email are stored
 * on the message instead of being read from the account.
 */
const feedbackSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    topic: { type: String, enum: FEEDBACK_TOPICS, default: 'general' },
    subject: { type: String, trim: true, maxlength: 140, default: '' },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },

    status: { type: String, enum: FEEDBACK_STATUSES, default: 'new', index: true },

    /** Set when the sender was signed in, so their orders can be found. */
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Internal — notes and who dealt with it. Never returned to customers. */
    note: { type: String, trim: true, maxlength: 1000, default: '' },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    handledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

feedbackSchema.index({ status: 1, createdAt: -1 });

export const Feedback = mongoose.model('Feedback', feedbackSchema);
export default Feedback;
