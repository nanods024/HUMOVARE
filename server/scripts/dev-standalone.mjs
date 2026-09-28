/**
 * Runs the full HUMOVARE API against a throwaway in-memory MongoDB.
 *
 *   npm run dev:standalone --workspace server
 *
 * Useful for demos, onboarding and UI work when you do not want to point at
 * a real Atlas cluster. The database is seeded on boot and discarded on exit,
 * so nothing here can touch production data.
 *
 * Requires the optional `mongodb-memory-server` dev dependency.
 */
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = Number(process.env.PORT) || 5000;

// Pin the mongod build so a fresh machine downloads one known-good version
// instead of whatever is latest that week.
const mongo = await MongoMemoryServer.create({
  binary: { version: process.env.MONGOMS_VERSION || '7.0.14' },
});
const uri = mongo.getUri('humovare');

// Set configuration before anything reads it — env.js snapshots on import.
Object.assign(process.env, {
  NODE_ENV: 'development',
  MONGODB_URI: uri,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex'),
  // Distinct from the customer secrets on purpose: an admin token must not
  // validate on a customer route, or the other way round.
  ADMIN_JWT_ACCESS_SECRET:
    process.env.ADMIN_JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex'),
  ADMIN_JWT_REFRESH_SECRET:
    process.env.ADMIN_JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex'),
  ADMIN_URL: process.env.ADMIN_URL || 'http://localhost:5174',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  DISABLE_RATE_LIMIT: 'true',
  PORT: String(PORT),
});

const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { seedDatabase } = await import('../src/seed/seed.js');
const { createApp } = await import('../src/app.js');
const { logger } = await import('../src/utils/logger.js');

await connectDB({ autoIndex: false });
await seedDatabase({ fresh: true });

const server = createApp().listen(PORT, () => {
  logger.info(`HUMOVARE API (standalone, in-memory DB) on http://localhost:${PORT}`);
  logger.info('Demo customer — demo@humovare.com · Humovare@2025 (admins sign in at /admin)');
  logger.info('Admin portal — owner@humovare.in · Humovare@Admin2025');
});

const shutdown = async () => {
  server.close();
  await disconnectDB();
  await mongo.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
