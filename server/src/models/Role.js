import mongoose from 'mongoose';
import { ALL_PERMISSIONS } from '../constants/permissions.js';

/**
 * A named bundle of permissions. Seeded from DEFAULT_ROLES; system roles
 * cannot be renamed or deleted, only their permission list adjusted (and
 * SUPER_ADMIN not even that — it is resolved to "everything" in code).
 */
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    description: { type: String, trim: true, default: '' },
    permissions: [{ type: String, enum: ALL_PERMISSIONS }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Role = mongoose.model('Role', roleSchema);
export default Role;
