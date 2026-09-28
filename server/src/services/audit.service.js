import { AuditLog } from '../models/AuditLog.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Keys that must never reach the audit trail, whatever the caller passes. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'mfaSecret',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'resetPasswordTokenHash',
]);

/**
 * Strips secrets and trims the payload before it is persisted.
 * Recursion is depth-capped so a pathological object cannot stall a request.
 */
function sanitise(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitise(item, depth + 1));
  if (typeof value !== 'object') return value;

  // Mongoose documents carry a lot of machinery; reduce to plain data first.
  const source = typeof value.toObject === 'function' ? value.toObject() : value;

  const clean = {};
  for (const [key, val] of Object.entries(source)) {
    if (REDACTED_KEYS.has(key)) {
      clean[key] = '[redacted]';
      continue;
    }
    clean[key] = sanitise(val, depth + 1);
  }
  return clean;
}

/** Pulls the caller's identity and origin off the request. */
export function auditContext(req) {
  return {
    adminUser: req.adminUser?._id ?? null,
    adminEmail: req.adminUser?.email ?? '',
    ip: req.ip ?? '',
    userAgent: String(req.headers?.['user-agent'] ?? '').slice(0, 300),
  };
}

/**
 * Writes an audit entry.
 *
 * Deliberately never throws: an audit failure must not roll back or fail the
 * operation the admin actually asked for. A failure is logged loudly instead.
 */
export async function recordAudit({
  req,
  action,
  resource = '',
  resourceId = '',
  description = '',
  metadata = null,
  before = null,
  after = null,
  status = 'success',
  admin = null,
}) {
  try {
    const context = req ? auditContext(req) : {};

    await AuditLog.create({
      ...context,
      // An explicit admin wins — login records the account before `req.adminUser` exists.
      ...(admin ? { adminUser: admin._id ?? null, adminEmail: admin.email ?? '' } : {}),
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : '',
      description,
      metadata: sanitise(metadata),
      before: sanitise(before),
      after: sanitise(after),
      status,
      // Fixed at write time: a later change to the retention setting affects
      // only entries written after that change, not this one.
      expiresAt: new Date(Date.now() + env.auditLog.retentionDays * DAY_MS),
    });
  } catch (error) {
    logger.error('Failed to write audit log', { action, message: error.message });
  }
}

/**
 * Called once at boot. Makes sure the TTL index exists, then:
 *
 *   1. gives every entry written before this feature existed an `expiresAt`
 *      (computed from its own `createdAt`, at the retention window in effect
 *      right now), so it eventually ages out like any other entry;
 *   2. immediately deletes whatever is already past that point, rather than
 *      waiting on Mongo's background TTL sweep (which runs on its own
 *      schedule, not the moment an entry expires).
 *
 * Safe to run every time the server starts: both steps are no-ops once every
 * entry already has its `expiresAt` set.
 */
export async function ensureAuditLogRetention() {
  await AuditLog.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const retentionMs = env.auditLog.retentionDays * DAY_MS;
  const backfilled = await AuditLog.updateMany(
    { expiresAt: null },
    [{ $set: { expiresAt: { $add: ['$createdAt', retentionMs] } } }],
  );

  const purged = await AuditLog.deleteMany({ expiresAt: { $lte: new Date() } });

  if (backfilled.modifiedCount || purged.deletedCount) {
    logger.info('Audit log retention applied', {
      retentionDays: env.auditLog.retentionDays,
      backfilled: backfilled.modifiedCount,
      purged: purged.deletedCount,
    });
  }
}

/** Paginated, filterable audit trail for the admin UI. */
export async function listAuditLogs(query = {}, { page = 1, limit = 25, skip = 0 } = {}) {
  const filter = {};

  if (query.action) filter.action = query.action;
  if (query.resource) filter.resource = query.resource;
  if (query.adminUser) filter.adminUser = query.adminUser;
  if (query.status) filter.status = query.status;

  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }

  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [{ adminEmail: pattern }, { description: pattern }, { resourceId: pattern }];
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('adminUser', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, total, page, limit };
}

export default { recordAudit, listAuditLogs, auditContext, ensureAuditLogRetention };
