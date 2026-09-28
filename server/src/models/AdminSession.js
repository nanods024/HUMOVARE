import mongoose from 'mongoose';

/**
 * One row per issued refresh token.
 *
 * Storing only the SHA-256 hash means a database leak cannot be replayed as a
 * session. Keeping a row per token is what makes revocation and login history
 * possible — a stateless JWT alone can neither be listed nor cancelled.
 */
const adminSessionSchema = new mongoose.Schema(
  {
    adminUser: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    /** Rotation chain — a reused token revokes the whole family. */
    family: { type: String, required: true, index: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: '' },
    lastUsedAt: { type: Date, default: Date.now },
    /**
     * When this sign-in began. Carried across refresh-token rotation, so the
     * absolute session limit counts from the password, not the last refresh.
     */
    familyStartedAt: { type: Date, default: Date.now },
    /** Last time the password was entered (sign-in or re-confirmation). */
    authenticatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

adminSessionSchema.index({ adminUser: 1, revokedAt: 1 });
// Mongo removes expired sessions on its own; no cleanup job required.
adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

adminSessionSchema.methods.isUsable = function isUsable() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
};

export const AdminSession = mongoose.model('AdminSession', adminSessionSchema);
export default AdminSession;
