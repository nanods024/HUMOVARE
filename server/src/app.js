import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { env } from './config/env.js';
import routes from './routes/index.js';
import adminRoutes from './routes/admin.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { sanitizeRequest } from './middleware/validation.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import { sendSuccess } from './utils/response.js';
import { logger } from './utils/logger.js';
import { ApiError } from './utils/ApiError.js';

export function createApp() {
  const app = express();

  // Behind a load balancer the client IP arrives in X-Forwarded-For; rate
  // limiting and secure cookies both depend on reading it correctly.
  // TRUST_PROXY is the number of proxy hops in front of the app (1 on Render
  // or behind one load balancer). Too high and X-Forwarded-For can be forged;
  // too low and every visitor shares the proxy's address.
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only, but images are delivered from Cloudinary,
      // so cross-origin resource embedding must stay permitted.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: env.isProd ? undefined : false,
      // Nothing served here is meant to be framed (clickjacking).
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // The storefront and the admin portal are the only permitted origins.
  // An origin is scheme + host (+ port) with no path, so "https://shop.com/"
  // typed into a setting must still match the browser's "https://shop.com".
  const toOrigin = (value) => {
    try {
      return new URL(String(value).trim()).origin;
    } catch {
      return '';
    }
  };
  // "shop.com" and "www.shop.com" are the same site to whoever owns it, and
  // the DNS host usually redirects one to the other. Browsers hide "www." in
  // the address bar, so the one typed into a setting is often not the one the
  // site is actually served from. Accept both.
  const withTwin = (origin) => {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || /^[\d.]+$|:/.test(url.hostname)) return [origin];
    const twin = new URL(origin);
    twin.hostname = url.hostname.startsWith('www.') ? url.hostname.slice(4) : `www.${url.hostname}`;
    return [origin, twin.origin];
  };
  // FRONTEND_URL and ADMIN_PUBLIC_URL name the public site for emails, so
  // they are permitted origins by definition.
  const allowedOrigins = new Set(
    [env.clientUrl, env.adminUrl, env.frontendUrl, env.adminPublicUrl, ...env.corsOrigins]
      .map(toOrigin)
      .filter(Boolean)
      .flatMap(withTwin),
  );
  logger.info(`CORS allows: ${[...allowedOrigins].join(', ') || '(none)'}`);

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin requests and server-to-server calls carry no Origin.
        if (!origin) return callback(null, true);
        if (allowedOrigins.has(origin)) return callback(null, true);
        if (env.isDev && /^http:\/\/localhost:\d+$/.test(origin)) return callback(null, true);
        return callback(ApiError.forbidden('This origin is not allowed', { code: 'CORS_REJECTED' }));
      },
      credentials: true, // required for the refresh cookie
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);

  app.use(
    morgan(env.isProd ? 'combined' : 'dev', {
      stream: { write: (message) => logger.info(message.trim()) },
      skip: (req) => req.path === '/health',
    }),
  );

  // Health check sits outside the rate limiter so uptime probes never trip it.
  app.get('/health', (_req, res) =>
    sendSuccess(res, {
      message: 'HUMOVARE API is healthy',
      data: { status: 'ok', uptime: Math.round(process.uptime()) },
    }),
  );

  // Opening the bare API address (or a host's `HEAD /` probe) gets a short
  // answer instead of a 404. Everything real lives under /api.
  app.get('/', (_req, res) =>
    sendSuccess(res, { message: 'HUMOVARE API', data: { status: 'ok', health: '/health', api: '/api' } }),
  );

  // Admin traffic is mounted before the customer API and carries its own
  // authentication, CSRF and permission stack — see admin.routes.js.
  app.use('/api/admin', apiLimiter, adminRoutes);
  app.use('/api', apiLimiter, routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
