/**
 * Lifts admin-panel lockouts from the command line. With the default
 * 'panel' scope this is the ONLY way to end a lock early, because the lock
 * refuses every admin request — including a super admin's.
 *
 *   npm run security:unblock                 # lift the panel-wide lock and every network block
 *   npm run security:unblock -- 203.0.113.9  # lift one IP's block only
 *
 * Needs shell access to the server and its .env — the same trust level as
 * the database itself. Per-email sign-in locks are left alone.
 */
import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { AdminLoginThrottle } from '../src/models/AdminLoginThrottle.js';
import { ipKey, normaliseIp } from '../src/services/adminLoginGuard.service.js';

const ip = process.argv[2];

await connectDB();
const filter = ip ? { key: ipKey(ip) } : { kind: { $in: ['ip', 'panel'] } };
const { deletedCount } = await AdminLoginThrottle.deleteMany(filter);
await disconnectDB();

console.warn(ip
  ? `Lifted ${deletedCount} block(s) for ${normaliseIp(ip)}.`
  : `Lifted ${deletedCount} lock(s) — the admin panel is open again.`);
console.warn('A running server may keep a blocked answer cached for up to 15 seconds.');
