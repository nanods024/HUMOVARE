import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES } from '../constants/index.js';

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
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
    /**
     * Never selected by default so a stray find() cannot leak the hash.
     * Accounts created with Google have no password until the customer sets
     * one through "Forgot password".
     */
    passwordHash: {
      type: String,
      select: false,
      required() {
        return !this.googleId;
      },
    },
    /** Google's stable account id (`sub`), set on first Google sign-in. */
    googleId: { type: String, default: undefined, unique: true, sparse: true },
    phone: { type: String, trim: true, match: /^[0-9]{10}$/, default: '' },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CUSTOMER, index: true },

    /**
     * Refresh-token rotation: bumping this invalidates every issued refresh
     * token at once (logout-everywhere, password change, suspected theft).
     */
    tokenVersion: { type: Number, default: 0, select: false },

    resetPasswordTokenHash: { type: String, select: false, default: null },
    resetPasswordExpiresAt: { type: Date, select: false, default: null },

    lastLoginAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, SALT_ROUNDS);
};

userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

/** Shape sent to the client — no hash, no token version, no reset fields. */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    phone: this.phone || '',
    role: this.role,
    createdAt: this.createdAt,
  };
};

// Newest customers first (admin list, dashboard).
userSchema.index({ createdAt: -1 });
// Password-reset links look the account up by the hashed token.
userSchema.index(
  { resetPasswordTokenHash: 1 },
  { partialFilterExpression: { resetPasswordTokenHash: { $type: 'string' } }, name: 'reset_token_lookup' },
);

export const User = mongoose.model('User', userSchema);
export default User;
