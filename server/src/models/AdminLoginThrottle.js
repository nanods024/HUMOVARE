import mongoose from 'mongoose';

/**
 * Failed admin sign-ins, counted per email address and per client IP.
 *
 * Keyed by a hash of the email rather than by account, so an address that has
 * no admin account is counted and locked exactly like one that does. The
 * responses are therefore identical either way, and the login form cannot be
 * used to discover which admin emails exist.
 *
 * Kept on the server (never in the browser), so refreshing the page, clearing
 * cookies or switching device does not reset the count.
 */
const adminLoginThrottleSchema = new mongoose.Schema(
  {
    /**
     * `email`: SHA-256 of the lower-cased address (the address itself is not
     * stored). `ip`: "ip:" + SHA-256 of the client IP.
     */
    key: { type: String, required: true, unique: true },
    /** `panel`: the single row that locks the whole admin panel for everyone. */
    kind: { type: String, enum: ['email', 'ip', 'panel'], default: 'email', index: true },
    /** IP rows only: shown to super admins so they can lift a block. */
    ip: { type: String, default: '' },
    /** Consecutive failures since the last success or the last lock. */
    failures: { type: Number, default: 0, min: 0 },
    lockedUntil: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    lastFailureIp: { type: String, default: '' },
    /** Cleared by Mongo a day after the last failure. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

adminLoginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AdminLoginThrottle = mongoose.model('AdminLoginThrottle', adminLoginThrottleSchema);
export default AdminLoginThrottle;
