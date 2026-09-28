import { createApp } from './app.js';
import { env, assertEnv } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { logger } from './utils/logger.js';
import { startEmailRetryWorker } from './services/email/notifications.js';
import { ensurePaymentIndexes, startPaymentReconciler, drainWebhookWork } from './services/payments/onlinePayment.service.js';
import { ensureAuditLogRetention } from './services/audit.service.js';
import { loadStoreSettings } from './services/storeSettings.service.js';
import { ensureThrottleIndexes } from './services/adminLoginGuard.service.js';

async function start() {
  assertEnv();
  await connectDB();
  // The payment indexes carry the duplicate-payment guarantee, so they are
  // built before the first request.
  await ensurePaymentIndexes();
  // Ages out old audit entries and purges any already overdue, so the trail
  // never grows without bound.
  await ensureAuditLogRetention();
  // Shipping fee, free-shipping threshold and COD rules come from Settings.
  await loadStoreSettings();
  // The admin sign-in lockout relies on a unique index to count attempts
  // atomically; build it before the first request.
  await ensureThrottleIndexes();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`HUMOVARE API listening on http://localhost:${env.port} [${env.nodeEnv}]`);
    logger.info(`Email transport: ${env.email.transport} · from ${env.email.from}`);
    logger.info(env.phonepe.isConfigured
      ? `Online payment: PhonePe (${env.phonepe.env})${env.phonepe.webhookConfigured ? '' : ' — webhook credentials not set'}`
      : 'Online payment: off (PhonePe not configured) — Cash on Delivery only');
    logger.info(`Audit log retention: ${env.auditLog.retentionDays} day(s)`);
  });

  // Picks up emails that failed transiently and are due another attempt.
  const stopEmailWorker = startEmailRetryWorker();
  // Re-checks unfinished payments with PhonePe and releases abandoned orders.
  const stopReconciler = startPaymentReconciler();

  /**
   * A port clash is the single most common way this fails to start, and it is
   * never a bug in the code — it is another copy of the server, or the
   * standalone in-memory one, already holding the port. A stack trace buries
   * that, so the listener error is handled here and says what to do instead.
   */
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${env.port} is already in use`);
      console.error(
        [
          '',
          `  Something else is already listening on port ${env.port}.`,
          '',
          '  Usually another copy of this server, or the in-memory one from',
          '  `npm run dev:standalone --workspace server`. Find and stop it:',
          '',
          `    Windows   netstat -ano | findstr :${env.port}`,
          '              taskkill /PID <pid> /F',
          `    macOS     lsof -ti tcp:${env.port} | xargs kill`,
          '',
          `  Or run this one somewhere else:  PORT=${Number(env.port) + 1} npm run dev:server`,
          '',
        ].join('\n'),
      );
    } else if (error.code === 'EACCES') {
      logger.error(`Not allowed to listen on port ${env.port}`);
      console.error(`\n  Port ${env.port} needs elevated privileges. Use a port above 1024.\n`);
    } else {
      logger.error('Server failed to start', { message: error.message });
    }

    process.exit(1);
  });

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests
   * finish, then close the database. A hard exit here would drop a checkout
   * mid-flight.
   */
  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    stopEmailWorker();
    stopReconciler();
    server.close(async () => {
      await drainWebhookWork();
      await disconnectDB();
      clearTimeout(forceExit);
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (error) => {
    // An uncaught exception leaves the process in an unknown state; log and
    // let the supervisor restart it. Listener errors are handled above and
    // never reach here.
    logger.error('Uncaught exception', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', { message: error.message });
  console.error(error.message);
  process.exit(1);
});
