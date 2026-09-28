import { env } from '../config/env.js';

/**
 * Tiny structured logger. Production emits single-line JSON so log shippers
 * (CloudWatch, Datadog, Loki) can parse it; development stays human-readable.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? (env.isProd ? LEVELS.info : LEVELS.debug);

const COLOURS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const method = level === 'debug' ? 'log' : level;

  if (env.isProd) {
    // eslint-disable-next-line no-console
    console[method](
      JSON.stringify({ level, time: new Date().toISOString(), message, ...(meta ? { meta } : {}) }),
    );
    return;
  }

  // eslint-disable-next-line no-console
  console[method](`${COLOURS[level]}[${level}]${RESET}`, message, meta ?? '');
}

export const logger = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),
};

export default logger;
