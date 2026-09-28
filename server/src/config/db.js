import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// `mongodb+srv://` needs a DNS SRV lookup before it can even open a socket.
// Node's resolver (c-ares) sometimes can't complete that against a home
// router's DNS forwarder (192.168.x.1) even though the OS resolver handles it
// fine — it shows up as `querySrv ECONNREFUSED` with the connection never
// getting as far as MongoDB. Pointing Node at a public resolver sidesteps it
// without touching the connection string.
dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);

mongoose.set('strictQuery', true);

// NOTE: `sanitizeFilter` is deliberately NOT enabled. It rewrites any
// operator-shaped value into `$eq`, which breaks legitimate server-built
// queries such as `{ price: { $gte, $lte } }`. Untrusted input is stripped of
// operator syntax one layer earlier, in `sanitizeRequest` middleware, which is
// the right place for it: filters assembled in a service are trusted by then.

let connection = null;

/**
 * @param {{ autoIndex?: boolean }} [options]
 *   `autoIndex` defaults to on outside production. The seeder turns it off
 *   because it calls `syncIndexes()` itself — letting both run at once makes
 *   the text-index build race its own rebuild and stall the connection.
 */
export async function connectDB(options = {}) {
  if (connection) return connection;

  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', err.message));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  connection = await mongoose.connect(env.mongoUri, {
    // Sensible Atlas defaults — fail fast rather than hanging a request.
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: options.autoIndex ?? !env.isProd,
  });

  return connection;
}

export async function disconnectDB() {
  if (!connection) return;
  await mongoose.disconnect();
  connection = null;
}

export default connectDB;
