import * as adminAuthService from '../services/adminAuth.service.js';
import { recordAudit } from '../services/audit.service.js';
import { notifyAdminLockout, notifyPanelLocked } from '../services/email/adminNotifications.js';
import { maskEmail } from '../services/email/email.service.js';
import { normaliseIp, listBlockedIps, unblockIpById } from '../services/adminLoginGuard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { env } from '../config/env.js';
import { AUDIT_ACTIONS } from '../constants/permissions.js';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  ADMIN_CSRF_COOKIE,
  adminAccessCookieOptions,
  adminRefreshCookieOptions,
  adminCsrfCookieOptions,
  newCsrfToken,
} from '../utils/adminToken.js';

/**
 * Writes the session cookies.
 *
 * Both tokens are HTTP-only so JavaScript cannot read them; the CSRF token is
 * deliberately readable, because the client has to echo it back in a header.
 */
function setSessionCookies(res, { accessToken, refreshToken }) {
  const csrfToken = newCsrfToken();

  res.cookie(ADMIN_ACCESS_COOKIE, accessToken, adminAccessCookieOptions());
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, adminRefreshCookieOptions());
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, adminCsrfCookieOptions());

  return csrfToken;
}

function clearSessionCookies(res) {
  res.clearCookie(ADMIN_ACCESS_COOKIE, { ...adminAccessCookieOptions(), maxAge: undefined });
  res.clearCookie(ADMIN_REFRESH_COOKIE, { ...adminRefreshCookieOptions(), maxAge: undefined });
  res.clearCookie(ADMIN_CSRF_COOKIE, { ...adminCsrfCookieOptions(), maxAge: undefined });
}

/**
 * The session payload the admin app receives. The access token is only
 * included outside production (for scripts and tests using a bearer header);
 * in production the browser holds it solely in its HTTP-only cookie.
 */
function sessionPayload(result, csrfToken) {
  return {
    user: result.user,
    permissions: result.permissions,
    csrfToken,
    security: adminAuthService.sessionPolicy(),
    ...(env.isProd ? {} : { accessToken: result.accessToken }),
  };
}

/** Audit + alert for the attempt that tripped a lock or an IP block. */
async function recordLockout(req, error, email) {
  if (error.justBlockedIp) {
    const panelWide = error.details?.scope === 'panel';
    const { ipBlockMinutes, ipMaxAttempts } = env.adminSecurity;
    await recordAudit({
      req,
      action: panelWide ? AUDIT_ACTIONS.ADMIN_PANEL_LOCKED : AUDIT_ACTIONS.ADMIN_IP_BLOCKED,
      resource: panelWide ? 'adminPanel' : 'network',
      description: panelWide
        ? `Admin panel locked for everyone for ${ipBlockMinutes} minutes after ${ipMaxAttempts} wrong passwords (last from ${normaliseIp(req.ip)})`
        : `Admin panel blocked for ${normaliseIp(req.ip)} for ${ipBlockMinutes} minutes after ${ipMaxAttempts} wrong passwords`,
      status: 'failure',
      metadata: { ip: normaliseIp(req.ip), blockedUntil: error.details?.blockedUntil, lastEmail: maskEmail(email) },
    });
    if (panelWide) {
      notifyPanelLocked({ lockedUntil: error.details?.blockedUntil, ip: normaliseIp(req.ip), lastEmail: maskEmail(email) }).catch(() => {});
    }
  }
  if (!error.justLocked) return;

  const lockedUntil = error.emailLockedUntil ?? error.details?.lockedUntil;
  await recordAudit({
    req,
    admin: error.lockedAdmin ?? null,
    action: AUDIT_ACTIONS.ADMIN_ACCOUNT_LOCKED,
    resource: 'adminUser',
    resourceId: error.lockedAdmin?._id ?? '',
    description: error.lockedAdmin
      ? `Sign-in locked for ${error.lockedAdmin.email} after ${env.adminSecurity.maxLoginAttempts} failed attempts`
      : `Sign-in locked for ${maskEmail(email)} (no admin account) after ${env.adminSecurity.maxLoginAttempts} failed attempts`,
    status: 'failure',
    metadata: { lockedUntil, lockMinutes: env.adminSecurity.lockMinutes },
  });
  if (error.lockedAdmin) {
    notifyAdminLockout({ admin: error.lockedAdmin, lockedUntil, ip: req.ip }).catch(() => {});
  }
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await adminAuthService.login({
      email,
      password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const csrfToken = setSessionCookies(res, result);

    await recordAudit({
      req,
      admin: result.admin,
      action: AUDIT_ACTIONS.ADMIN_LOGIN,
      resource: 'adminUser',
      resourceId: result.admin._id,
      description: `${email} signed in`,
    });

    return sendSuccess(res, { message: 'Signed in successfully', data: sessionPayload(result, csrfToken) });
  } catch (error) {
    if (error.justLocked || error.justBlockedIp) await recordLockout(req, error, email);

    // Failed attempts are recorded too — that trail is how you spot an attack.
    await recordAudit({
      req,
      action: AUDIT_ACTIONS.ADMIN_LOGIN_FAILED,
      resource: 'adminUser',
      description: `Failed sign-in for ${email}`,
      status: 'failure',
      metadata: { reason: error.code ?? error.message },
    });
    throw error;
  }
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const result = await adminAuthService.refresh({
      refreshToken: req.cookies?.[ADMIN_REFRESH_COOKIE],
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const csrfToken = setSessionCookies(res, result);
    return sendSuccess(res, { message: 'Session refreshed', data: sessionPayload(result, csrfToken) });
  } catch (error) {
    // A dead session leaves nothing usable behind in the browser.
    clearSessionCookies(res);
    throw error;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await adminAuthService.logout(req.cookies?.[ADMIN_REFRESH_COOKIE], req.adminSession?._id);
  clearSessionCookies(res);

  if (req.adminUser) {
    await recordAudit({
      req,
      action: AUDIT_ACTIONS.ADMIN_LOGOUT,
      resource: 'adminUser',
      resourceId: req.adminUser._id,
      description: `${req.adminUser.email} signed out`,
    });
  }

  return sendSuccess(res, { message: 'Signed out', data: null });
});

export const me = asyncHandler(async (req, res) =>
  sendSuccess(res, {
    message: 'Admin fetched',
    data: {
      user: req.adminUser.toPublicJSON(req.adminPermissions),
      permissions: req.adminPermissions,
      security: adminAuthService.sessionPolicy(),
      authenticatedAt: req.adminSession?.authenticatedAt ?? null,
    },
  }),
);

export const sessions = asyncHandler(async (req, res) => {
  const list = await adminAuthService.listSessions(req.adminUser._id);
  return sendSuccess(res, { message: 'Sessions fetched', data: { sessions: list } });
});

/** Re-enter the password to unlock sensitive actions for a few minutes. */
export const reauth = asyncHandler(async (req, res) => {
  try {
    const result = await adminAuthService.reauthenticate({
      admin: req.adminUser,
      session: req.adminSession,
      password: req.body.password,
      ip: req.ip,
    });

    await recordAudit({
      req,
      action: AUDIT_ACTIONS.ADMIN_REAUTHENTICATED,
      resource: 'adminUser',
      resourceId: req.adminUser._id,
      description: `${req.adminUser.email} confirmed their password`,
    });

    return sendSuccess(res, {
      message: 'Password confirmed',
      data: { authenticatedAt: result.authenticatedAt, reauthMinutes: env.adminSecurity.reauthMinutes },
    });
  } catch (error) {
    if (error.justLocked || error.justBlockedIp) {
      await recordLockout(req, error, req.adminUser.email);
      clearSessionCookies(res);
    }
    await recordAudit({
      req,
      action: AUDIT_ACTIONS.ADMIN_REAUTH_FAILED,
      resource: 'adminUser',
      resourceId: req.adminUser._id,
      description: `${req.adminUser.email} entered a wrong password to confirm an action`,
      status: 'failure',
      metadata: { reason: error.code ?? error.message },
    });
    throw error;
  }
});

export const changePassword = asyncHandler(async (req, res) => {
  let admin;
  try {
    admin = await adminAuthService.changeOwnPassword(req.adminUser._id, req.body, { ip: req.ip });
  } catch (error) {
    if (error.justLocked || error.justBlockedIp) {
      await recordLockout(req, error, req.adminUser.email);
      clearSessionCookies(res);
    }
    throw error;
  }

  // Every session was just invalidated, including this one — issue a new pair.
  const fresh = await adminAuthService.startSession(admin, { ip: req.ip, userAgent: req.headers['user-agent'] });
  const csrfToken = setSessionCookies(res, fresh);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET,
    resource: 'adminUser',
    resourceId: admin._id,
    description: `${admin.email} changed their own password`,
  });

  return sendSuccess(res, { message: 'Password updated', data: sessionPayload(fresh, csrfToken) });
});

/** Same answer whether or not the email is an admin — nothing to enumerate. */
export const forgotPassword = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.requestPasswordReset({ email: req.body.email });

  await recordAudit({
    req,
    admin,
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET_REQUESTED,
    resource: 'adminUser',
    resourceId: admin?._id ?? '',
    description: admin
      ? `Password reset link sent to ${admin.email}`
      : `Password reset requested for ${maskEmail(req.body.email)} (no link sent)`,
  });

  return sendSuccess(res, {
    message: 'If that email belongs to an admin account, a reset link is on its way. It expires in '
      + `${env.adminSecurity.resetTokenMinutes} minutes.`,
    data: null,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.resetPasswordWithToken(req.body);
  clearSessionCookies(res);

  await recordAudit({
    req,
    admin,
    action: AUDIT_ACTIONS.ADMIN_PASSWORD_RESET,
    resource: 'adminUser',
    resourceId: admin._id,
    description: `${admin.email} reset their password from an emailed link`,
  });

  return sendSuccess(res, { message: 'Password updated. Sign in with your new password.', data: null });
});

/**
 * Public, and deliberately boring: if this answers 200 the network is not
 * blocked. A blocked network never reaches it — the IP guard in front of the
 * admin router answers 423 first. The admin app calls it on every load, so a
 * refresh shows the blocked screen instead of a login form.
 */
export const status = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    message: 'Admin panel available',
    data: { blocked: false, security: adminAuthService.sessionPolicy() },
  }),
);

/** Networks currently shut out of the admin panel (super admins only). */
export const blockedIps = asyncHandler(async (_req, res) => {
  const rows = await listBlockedIps();
  return sendSuccess(res, {
    message: 'Blocked networks fetched',
    data: {
      blocks: rows.map((row) => ({
        id: String(row._id),
        scope: row.kind === 'panel' ? 'panel' : 'network',
        ip: row.kind === 'panel' ? row.lastFailureIp : row.ip,
        blockedUntil: row.lockedUntil,
        lastFailureAt: row.lastFailureAt,
      })),
    },
  });
});

export const unblockIp = asyncHandler(async (req, res) => {
  const row = await unblockIpById(req.params.id);

  await recordAudit({
    req,
    action: AUDIT_ACTIONS.ADMIN_IP_UNBLOCKED,
    resource: 'network',
    resourceId: String(row._id),
    description: row.kind === 'panel' ? 'Lifted the admin-panel lock for everyone' : `Lifted the admin-panel block on ${row.ip}`,
  });

  return sendSuccess(res, { message: 'Network unblocked', data: { id: String(row._id) } });
});
