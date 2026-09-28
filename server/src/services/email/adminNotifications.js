import { EMAIL_TYPES } from '../../models/EmailEvent.js';
import { AdminUser } from '../../models/AdminUser.js';
import { env } from '../../config/env.js';
import { ADMIN_ROLES } from '../../constants/permissions.js';
import { sendEmail } from './email.service.js';
import { renderTemplate } from './templates/index.js';

/**
 * Admin-portal security emails. None are retryable: the reset link exists
 * only in the call that made it, and an alert that arrives hours later is
 * worse than none. Each resolves with the send outcome and never rejects.
 */

export function sendAdminPasswordReset({ admin, resetUrl, tokenHash, expiresInMinutes }) {
  return sendEmail({
    type: EMAIL_TYPES.ADMIN_PASSWORD_RESET,
    to: admin.email,
    idempotencyKey: `admin-password-reset:${admin._id}:${String(tokenHash).slice(0, 24)}`,
    retryable: false,
    render: () => renderTemplate(EMAIL_TYPES.ADMIN_PASSWORD_RESET, { name: admin.name, resetUrl, expiresInMinutes }),
  });
}

export function notifyAdminPasswordChanged(admin) {
  const changedAt = admin.passwordChangedAt ?? new Date();
  return sendEmail({
    type: EMAIL_TYPES.ADMIN_PASSWORD_CHANGED,
    to: admin.email,
    idempotencyKey: `admin-password-changed:${admin._id}:${changedAt.getTime()}`,
    retryable: false,
    render: () => renderTemplate(EMAIL_TYPES.ADMIN_PASSWORD_CHANGED, { name: admin.name, changedAt }),
  });
}

/**
 * Tells the account owner, every active super admin and the optional
 * SECURITY_ALERT_EMAIL that an admin account has been locked. Only sent for
 * real admin accounts — locks on made-up addresses are audited but never
 * emailed, so an attacker cannot use them to flood inboxes.
 */
export async function notifyAdminLockout({ admin, lockedUntil, ip }) {
  if (!admin?.email) return [];

  const superAdmins = await AdminUser.find({ role: ADMIN_ROLES.SUPER_ADMIN, isActive: true }).select('email').lean();
  const recipients = new Set([admin.email, ...superAdmins.map((a) => a.email), env.adminSecurity.alertEmail].filter(Boolean));

  const view = {
    accountEmail: admin.email,
    lockedUntil,
    ip,
    lockMinutes: env.adminSecurity.lockMinutes,
    attempts: env.adminSecurity.maxLoginAttempts,
  };

  return Promise.all([...recipients].map((to) => sendEmail({
    type: EMAIL_TYPES.ADMIN_SECURITY_ALERT,
    to,
    idempotencyKey: `admin-lockout:${admin._id}:${new Date(lockedUntil).getTime()}:${to}`,
    retryable: false,
    render: () => renderTemplate(EMAIL_TYPES.ADMIN_SECURITY_ALERT, view),
  })));
}

/**
 * Tells every active super admin (and SECURITY_ALERT_EMAIL) that the whole
 * admin panel has locked. One email per lock per recipient — a lock lasts
 * its full period, so this is at most one message every lock period.
 */
export async function notifyPanelLocked({ lockedUntil, ip, lastEmail }) {
  const superAdmins = await AdminUser.find({ role: ADMIN_ROLES.SUPER_ADMIN, isActive: true }).select('email').lean();
  const recipients = new Set([...superAdmins.map((a) => a.email), env.adminSecurity.alertEmail].filter(Boolean));

  const view = {
    lockedUntil,
    ip,
    lastEmail,
    lockMinutes: env.adminSecurity.ipBlockMinutes,
    attempts: env.adminSecurity.ipMaxAttempts,
  };

  return Promise.all([...recipients].map((to) => sendEmail({
    type: EMAIL_TYPES.ADMIN_PANEL_LOCKED,
    to,
    idempotencyKey: `admin-panel-locked:${new Date(lockedUntil).getTime()}:${to}`,
    retryable: false,
    render: () => renderTemplate(EMAIL_TYPES.ADMIN_PANEL_LOCKED, view),
  })));
}

export default { sendAdminPasswordReset, notifyAdminPasswordChanged, notifyAdminLockout, notifyPanelLocked };
