import mongoose from 'mongoose';

/**
 * Record of admin activity.
 *
 * No route updates or deletes an entry, and nothing lets an admin — ordinary
 * or super — remove one on demand. Entries do age out on their own, though:
 * each one is written with `expiresAt` already set (see audit.service.js),
 * and MongoDB's TTL monitor permanently removes it once that time passes,
 * the same mechanism AdminSession uses for expired sessions. This bounds how
 * much the trail grows in storage, at the cost of not keeping activity older
 * than `AUDIT_LOG_RETENTION_DAYS` (server/src/config/env.js).
 *
 * `before`/`after` are stored as free-form objects so a diff can be
 * reconstructed, with sensitive keys stripped by the service before it ever
 * reaches here.
 */
const auditLogSchema = new mongoose.Schema(
  {
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', index: true },
    adminEmail: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    resource: { type: String, default: '', index: true },
    resourceId: { type: String, default: '' },
    description: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
    /** When this entry is permanently deleted. Set once, at creation. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminUser: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
// Mongo removes expired entries on its own; no cleanup job required. A null
// expiresAt (entries written before this feature existed) is simply skipped
// by the TTL monitor until the one-time backfill in ensureAuditLogRetention
// gives it a value.
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
