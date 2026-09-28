import { AdminUser } from '../models/AdminUser.js';
import { AdminSession } from '../models/AdminSession.js';
import { Role } from '../models/Role.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, buildPaginationMeta } from '../utils/pagination.js';
import { revokeAllSessions, resolvePermissions, assertPasswordAllowed } from './adminAuth.service.js';
import { lockStatus, clearFailures } from './adminLoginGuard.service.js';
import { ADMIN_ROLES, DEFAULT_ROLES } from '../constants/permissions.js';

export async function listAdmins(query = {}) {
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(safe, 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [admins, total] = await Promise.all([
    AdminUser.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AdminUser.countDocuments(filter),
  ]);

  const locks = await lockStatus(admins.map((admin) => admin.email));

  return {
    admins: admins.map((admin) => ({ ...admin.toPublicJSON(), lockedUntil: locks.get(admin.email) ?? null })),
    pagination: buildPaginationMeta({ page, limit, total }),
  };
}

export async function getAdmin(id) {
  const admin = await AdminUser.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');

  const permissions = await resolvePermissions(admin);
  return admin.toPublicJSON(permissions);
}

/**
 * Only a SUPER_ADMIN may mint another SUPER_ADMIN — otherwise an ADMIN with
 * `admins.create` could grant themselves the one role that bypasses every
 * permission check.
 */
function assertCanAssignRole(actor, role) {
  if (role === ADMIN_ROLES.SUPER_ADMIN && actor.role !== ADMIN_ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can assign the SUPER_ADMIN role');
  }
}

const isSuper = (admin) => admin.role === ADMIN_ROLES.SUPER_ADMIN;

/**
 * Only a super admin may touch a super admin's account — otherwise an ADMIN
 * holding `admins.update` could demote the owner, disable them, or reset
 * their password and sign in as them.
 */
function assertCanManage(actor, target) {
  if (isSuper(target) && !isSuper(actor)) {
    throw ApiError.forbidden('Only a super admin can change a super admin account');
  }
}

/**
 * Resetting a password, unlocking or disabling an account is as good as
 * taking it over, so an admin may only do it to someone whose access they
 * hold in full. A super admin holds everything, so this never limits them.
 */
async function assertOutranks(actor, target) {
  if (isSuper(actor)) return;
  const own = new Set(await resolvePermissions(actor));
  const theirs = await resolvePermissions(target);
  if (theirs.some((permission) => !own.has(permission))) {
    throw ApiError.forbidden('You cannot manage an admin who has access you do not have');
  }
}

/** Nobody edits their own role or permissions — that is how escalation starts. */
function assertNotSelf(actor, target, what) {
  if (target._id.equals(actor._id)) throw ApiError.forbidden(`You cannot change your own ${what}`);
}

/**
 * Least privilege: an admin can only hand out access they hold themselves,
 * whether directly or through the role they assign. A super admin holds
 * everything, so this never limits them.
 */
async function assertGrantable(actor, { role, grantedPermissions = [] } = {}) {
  if (isSuper(actor)) return;
  const own = new Set(await resolvePermissions(actor));

  const wanted = [...grantedPermissions];
  if (role) {
    const bundle = await Role.findOne({ name: role }).lean();
    wanted.push(...(bundle?.permissions ?? []));
  }

  const beyond = [...new Set(wanted.filter((permission) => !own.has(permission)))];
  if (beyond.length) {
    throw ApiError.forbidden(`You cannot grant access you do not have yourself (${beyond.join(', ')})`);
  }
}

export async function createAdmin(payload, actor) {
  assertCanAssignRole(actor, payload.role);
  await assertGrantable(actor, payload);
  assertPasswordAllowed(payload.password, payload);

  const exists = await AdminUser.findOne({ email: payload.email });
  if (exists) throw ApiError.conflict('An admin with this email already exists');

  const admin = new AdminUser({
    name: payload.name,
    email: payload.email,
    role: payload.role,
    grantedPermissions: payload.grantedPermissions ?? [],
    revokedPermissions: payload.revokedPermissions ?? [],
    // A password chosen by someone else must be replaced on first use.
    mustChangePassword: true,
    createdBy: actor._id,
  });

  await admin.setPassword(payload.password);
  await admin.save();

  return admin.toPublicJSON();
}

export async function updateAdmin(id, payload, actor) {
  const admin = await AdminUser.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  assertCanManage(actor, admin);

  const changesAccess = payload.role !== undefined
    || payload.grantedPermissions !== undefined
    || payload.revokedPermissions !== undefined;
  if (changesAccess) {
    assertNotSelf(actor, admin, 'role or permissions');
    await assertGrantable(actor, {
      role: payload.role && payload.role !== admin.role ? payload.role : undefined,
      grantedPermissions: payload.grantedPermissions ?? [],
    });
  }

  if (payload.role && payload.role !== admin.role) {
    assertCanAssignRole(actor, payload.role);

    // Removing the last super admin would lock everyone out of the portal.
    if (admin.role === ADMIN_ROLES.SUPER_ADMIN) {
      const remaining = await AdminUser.countDocuments({
        role: ADMIN_ROLES.SUPER_ADMIN,
        isActive: true,
        _id: { $ne: admin._id },
      });
      if (remaining === 0) throw ApiError.conflict('The last super admin cannot be demoted');
    }
  }

  const fields = ['name', 'role', 'grantedPermissions', 'revokedPermissions'];
  for (const field of fields) {
    if (payload[field] !== undefined) admin[field] = payload[field];
  }

  await admin.save();

  // A permission or role change must not leave an older session over-entitled.
  if (payload.role || payload.grantedPermissions || payload.revokedPermissions) {
    await revokeAllSessions(admin._id, 'permissions-changed');
  }

  return admin.toPublicJSON();
}

export async function setAdminActive(id, isActive, actor) {
  const admin = await AdminUser.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  assertCanManage(actor, admin);
  await assertOutranks(actor, admin);

  if (!isActive) {
    if (admin._id.equals(actor._id)) throw ApiError.badRequest('You cannot disable your own account');

    if (admin.role === ADMIN_ROLES.SUPER_ADMIN) {
      const remaining = await AdminUser.countDocuments({
        role: ADMIN_ROLES.SUPER_ADMIN,
        isActive: true,
        _id: { $ne: admin._id },
      });
      if (remaining === 0) throw ApiError.conflict('The last super admin cannot be disabled');
    }
  }

  admin.isActive = isActive;
  await admin.save();

  // Disabling must take effect immediately, not when the token happens to expire.
  if (!isActive) await revokeAllSessions(admin._id, 'account-disabled');

  return admin.toPublicJSON();
}

/**
 * Permanently removes an admin account: the account document itself, and
 * every refresh-token session ever issued to it. Unlike disabling, this
 * cannot be undone — the record and its login history are gone, not just
 * marked inactive.
 *
 * The audit log entry for the deletion is not part of "the admin's data" —
 * it is the system's own record that the action happened, written from a
 * snapshot taken before the account is removed, the same way a deleted
 * product still leaves a PRODUCT_DELETED entry behind.
 */
export async function deleteAdmin(id, actor) {
  const admin = await AdminUser.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');

  if (admin._id.equals(actor._id)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  // Only a super admin may remove another super admin — mirrors who may
  // grant that role in the first place.
  if (admin.role === ADMIN_ROLES.SUPER_ADMIN) {
    if (actor.role !== ADMIN_ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only a super admin can delete a super admin');
    }

    const remaining = await AdminUser.countDocuments({
      role: ADMIN_ROLES.SUPER_ADMIN,
      isActive: true,
      _id: { $ne: admin._id },
    });
    if (remaining === 0) throw ApiError.conflict('The last super admin cannot be deleted');
  }

  const snapshot = {
    id: admin._id.toString(),
    name: admin.name,
    email: admin.email,
    role: admin.role,
  };

  // Every session this admin ever held is removed along with the account —
  // not merely revoked, since the account they belonged to no longer exists.
  await AdminSession.deleteMany({ adminUser: admin._id });
  await admin.deleteOne();

  return snapshot;
}

export async function resetAdminPassword(id, newPassword, actor) {
  const admin = await AdminUser.findById(id).select('+passwordHash +tokenVersion');
  if (!admin) throw ApiError.notFound('Admin not found');
  assertCanManage(actor, admin);
  await assertOutranks(actor, admin);
  if (admin._id.equals(actor._id)) {
    throw ApiError.badRequest('Use "Change password" to change your own password — it asks for your current one.');
  }
  assertPasswordAllowed(newPassword, admin);

  await admin.setPassword(newPassword);
  admin.mustChangePassword = true;
  await admin.save();

  await revokeAllSessions(admin._id, 'password-reset');
  return admin.toPublicJSON();
}

/** Lifts a sign-in lock before it expires on its own. */
export async function unlockAdmin(id, actor) {
  const admin = await AdminUser.findById(id);
  if (!admin) throw ApiError.notFound('Admin not found');
  assertCanManage(actor, admin);
  await assertOutranks(actor, admin);
  await clearFailures(admin.email);
  return admin.toPublicJSON();
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles() {
  return Role.find({}).sort({ name: 1 }).lean();
}

export async function updateRole(id, payload, actor) {
  if (actor && payload.permissions) await assertGrantable(actor, { grantedPermissions: payload.permissions });
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');

  // SUPER_ADMIN is resolved to "everything" in code; editing it would be a lie.
  if (role.name === ADMIN_ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('The SUPER_ADMIN role always has every permission and cannot be edited');
  }

  if (payload.permissions) role.permissions = payload.permissions;
  if (payload.description !== undefined) role.description = payload.description;

  await role.save();
  return role.toObject();
}

/** Idempotent seed so a new permission reaches existing installs. */
export async function ensureRoles() {
  for (const definition of DEFAULT_ROLES) {
    await Role.findOneAndUpdate(
      { name: definition.name },
      { $setOnInsert: definition },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  return Role.find({}).lean();
}

export default {
  listAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  setAdminActive,
  deleteAdmin,
  resetAdminPassword,
  unlockAdmin,
  listRoles,
  updateRole,
  ensureRoles,
};
