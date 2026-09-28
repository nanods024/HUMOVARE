import { logger } from './logger.js';

/**
 * Builds a model's declared indexes one at a time.
 *
 * Mongoose's `syncIndexes()` issues every `createIndex` concurrently. On a
 * model like Product, which declares ~22 indexes, that fans out enough
 * simultaneous commands to saturate the connection pool and the calls start
 * hitting the socket timeout. Creating them in sequence is both reliable and
 * fast (roughly 15ms per index), so the seeder and the optional index script
 * both go through here.
 */
export async function ensureIndexes(Model) {
  const specs = Model.schema.indexes();
  let created = 0;

  for (const [key, options = {}] of specs) {
    const rest = { ...options };
    // `background` is a no-op from MongoDB 4.2 and rejected by 7.x.
    delete rest.background;

    try {
      logger.debug(`  createIndex ${Model.modelName} ${JSON.stringify(key)}`);
      await Model.collection.createIndex(key, rest);
      created += 1;
    } catch (error) {
      // An existing index with different options is a schema change that
      // needs a deliberate migration, not a silent rebuild during seeding.
      if (error.codeName === 'IndexOptionsConflict' || error.code === 85 || error.code === 86) {
        logger.warn(
          `Index conflict on ${Model.modelName} ${JSON.stringify(key)} — drop it manually to rebuild`,
        );
        continue;
      }
      throw error;
    }
  }

  return { model: Model.modelName, created, declared: specs.length };
}

/** Runs `ensureIndexes` across several models, one model at a time. */
export async function ensureIndexesFor(models) {
  const results = [];

  for (const Model of models) {
    const result = await ensureIndexes(Model);
    logger.debug(`Indexes ready for ${result.model} (${result.created}/${result.declared})`);
    results.push(result);
  }

  return results;
}

export default ensureIndexes;
