/**
 * Creates any index a model declares that the database does not have yet.
 * Production runs with autoIndex off, so run this once after a deploy that
 * adds indexes:  npm run db:indexes
 *
 * Create-only and idempotent: existing indexes and all data are left alone.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { ensureIndexesFor } from '../src/utils/indexes.js';
import * as models from './lib/all-models.mjs';

await connectDB({ autoIndex: false });
const results = await ensureIndexesFor(Object.values(models));
for (const r of results) console.log(`${r.model.padEnd(22)} ${r.created}/${r.declared} indexes ensured`);
await disconnectDB();
