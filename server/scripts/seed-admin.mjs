/**
 * Brings the admin/CMS side of a database in step with the code.
 *
 *   npm run seed:admin --workspace server
 *
 * This is the command to run after pulling changes. It touches only the things
 * the admin portal owns — roles, the super admin, home page sections, the shop
 * page configuration and store settings — and every write is either an insert
 * of something missing or a reconciliation of something the storefront no
 * longer supports.
 *
 * It deliberately does NOT run the catalogue seed. `npm run seed` rewrites the
 * 18 seeded products from `seed/data.js`, which would undo any price, stock or
 * imagery you have changed since. Use this instead on a database with real
 * data in it.
 */
import 'dotenv/config';

import { connectDB, disconnectDB } from '../src/config/db.js';
import { seedAdmin } from '../src/seed/seedAdmin.js';
import { logger } from '../src/utils/logger.js';

async function run() {
  await connectDB({ autoIndex: false });

  const result = await seedAdmin({});

  logger.info(
    `Admin data ready — ${result.roles} roles, super admin ${result.superAdmin}, ` +
      `${result.sections} home page sections defined`,
  );

  await disconnectDB();
}

run().catch(async (error) => {
  logger.error('Admin seed failed', { message: error.message });
  console.error(error);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
