import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ADMIN_ROLES, ALL_PERMISSIONS } from '../constants/permissions.js';

const SALT_ROUNDS = 12;

/**
 * Admin identity, deliberately a separate collection from `User`.
 *
 * Customers and admins never share a record, a token namespace or a login
 * route, so no amount of tampering with a customer session can produce admin
 * access — the signature and the `typ` claim both fail.
 */
const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    /** Never selected by default, so a stray find() cannot leak the hash. */
    passwordHash: { type: String, required: true, select: false },

    role: {
      type: String,
      enum: Object.values(ADMIN_ROLES),
      default: ADMIN_ROLES.ADMIN,
      index: true,
    },

    /**
     * Per-admin overrides layered on top of the role. `granted` adds,
     * `revoked` removes — revoked always wins, so taking access away is never
     * undone by a role change.
     */
    grantedPermissions: [{ type: String, enum: ALL_PERMISSIONS }],
    revokedPermissions: [{ type: String, enum: ALL_PERMISSIONS }],

    isActive: { type: Boolean, default: true, index: true },

    /**
     * Bumping this invalidates every issued token for the account at once —
     * used by password change, disable and "sign out everywhere".
     */
    tokenVersion: { type: Number, default: 0, select: false },

    // MFA-ready: the fields exist so enabling TOTP later is a service change,
    // not a migration. Nothing reads them yet.
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false, default: null },

    // Superseded by AdminLoginThrottle (counted per email, so unknown
    // addresses behave identically). Kept only so old documents still load.
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },

    /** Self-service reset: only the SHA-256 of the emailed token is stored. */
    resetTokenHash: { type: String, default: null, select: false, index: true },
    resetTokenExpiresAt: { type: Date, default: null, select: false },
    resetRequestedAt: { type: Date, default: null, select: false },
    passwordChangedAt: { type: Date, default: null },

    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '' },

    mustChangePassword: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true },
);

adminUserSchema.index({ isActive: 1, role: 1 });

adminUserSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  this.passwordChangedAt = new Date();
  // Any outstanding reset link dies with the old password.
  this.resetTokenHash = null;
  this.resetTokenExpiresAt = null;
};

adminUserSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

adminUserSchema.methods.registerSuccessfulLogin = async function registerSuccessfulLogin(ip) {
  this.failedLoginAttempts = 0;
  this.lockedUntil = null;
  this.lastLoginAt = new Date();
  this.lastLoginIp = ip || '';
  await this.save();
};

/**
 * Effective permissions = role bundle + granted − revoked.
 * SUPER_ADMIN short-circuits to everything, so a newly added permission is
 * never missing from the owner account.
 */
adminUserSchema.methods.effectivePermissions = function effectivePermissions(rolePermissions = []) {
  if (this.role === ADMIN_ROLES.SUPER_ADMIN) return [...ALL_PERMISSIONS];

  const granted = new Set([...rolePermissions, ...(this.grantedPermissions ?? [])]);
  (this.revokedPermissions ?? []).forEach((permission) => granted.delete(permission));
  return [...granted];
};

/** Shape sent to the admin client — no hash, no MFA secret, no lock counters. */
adminUserSchema.methods.toPublicJSON = function toPublicJSON(permissions) {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    role: this.role,
    isActive: this.isActive,
    mfaEnabled: this.mfaEnabled,
    mustChangePassword: this.mustChangePassword,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
    ...(permissions ? { permissions } : {}),
  };
};

export const AdminUser = mongoose.model('AdminUser', adminUserSchema);
export default AdminUser;
