import dotenv from 'dotenv';

dotenv.config();

/**
 * Centralised, validated environment access.
 * Nothing else in the codebase reads `process.env` directly — that keeps
 * configuration mistakes as a single loud failure at boot instead of a
 * mystery `undefined` deep inside a request handler.
 */

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** The live site. Production links fall back to it when nothing else is set. */
const PUBLIC_SITE_URL = 'https://humovare.in';
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Where links in emails point. Separate from CLIENT_URL (which drives CORS)
 * because the two differ in staging, and a reset link must always land on
 * the public storefront rather than on whatever origin made the request.
 */
const frontendUrl = (
  process.env.FRONTEND_URL
  || (isProduction ? PUBLIC_SITE_URL : process.env.CLIENT_URL || 'http://localhost:5173')
).replace(/\/+$/, '');

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  get isProd() {
    return this.nodeEnv === 'production';
  },
  get isDev() {
    return this.nodeEnv === 'development';
  },
  port: num(process.env.PORT, 5000),

  clientUrl: process.env.CLIENT_URL || (isProduction ? PUBLIC_SITE_URL : 'http://localhost:5173'),
  frontendUrl,
  adminUrl: process.env.ADMIN_URL || 'http://localhost:5174',
  corsOrigins: list(process.env.CORS_ORIGINS),

  mongoUri: process.env.MONGODB_URI,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  /**
   * Admin tokens are signed with their own secrets and carry `typ: 'admin'`.
   * A customer token can therefore never authenticate an admin route — it
   * fails both the signature check and the type check.
   */
  adminJwt: {
    accessSecret: process.env.ADMIN_JWT_ACCESS_SECRET,
    refreshSecret: process.env.ADMIN_JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.ADMIN_JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.ADMIN_JWT_REFRESH_EXPIRES_IN || '7d',
  },

  /**
   * Admin sign-in and session policy. Every value is enforced on the server;
   * the admin app only reads them to show the right countdowns.
   */
  adminSecurity: {
    /** Consecutive wrong passwords before sign-in is locked for that email. */
    maxLoginAttempts: Math.max(1, num(process.env.ADMIN_LOGIN_MAX_ATTEMPTS, 3)),
    lockMinutes: Math.max(1, num(process.env.ADMIN_LOGIN_LOCK_MINUTES, 30)),
    /**
     * Wrong passwords from one IP (any email) before that IP is shut out of
     * the whole admin panel, and for how long.
     */
    ipMaxAttempts: Math.max(1, num(process.env.ADMIN_IP_MAX_ATTEMPTS, 3)),
    ipBlockMinutes: Math.max(1, num(process.env.ADMIN_IP_BLOCK_MINUTES, 30)),
    /**
     * What those wrong passwords lock:
     *  • 'panel' (default) — the ENTIRE admin panel, for everyone, on every
     *    network. Strongest; note that anyone can trigger it, and the lock is
     *    lifted early only from the server shell (`npm run security:unblock`).
     *  • 'network' — only the IP address the attempts came from.
     * Read on each use, so it can be changed without a code change.
     */
    get lockoutScope() {
      return process.env.ADMIN_LOCKOUT_SCOPE === 'network' ? 'network' : 'panel';
    },
    /** Signed out after this long with no activity. */
    idleMinutes: Math.max(5, num(process.env.ADMIN_SESSION_IDLE_MINUTES, 30)),
    /** Signed out after this long regardless of activity. */
    maxSessionHours: Math.max(1, num(process.env.ADMIN_SESSION_MAX_HOURS, 12)),
    /** Sensitive actions need a password entered within this window. */
    reauthMinutes: Math.max(1, num(process.env.ADMIN_REAUTH_MINUTES, 10)),
    /** Admin password-reset links expire after this long. */
    resetTokenMinutes: Math.max(5, num(process.env.ADMIN_RESET_TOKEN_MINUTES, 30)),
    /** Optional extra inbox for lockout alerts (super admins always get them). */
    alertEmail: (process.env.SECURITY_ALERT_EMAIL || '').trim().toLowerCase(),
  },

  /** Where the admin app is served, for links in admin emails. */
  adminPublicUrl: (process.env.ADMIN_PUBLIC_URL || `${frontendUrl}/admin`).replace(/\/+$/, ''),

  cookie: {
    domain: process.env.COOKIE_DOMAIN || undefined,
    // Refresh cookie lifetime in ms — keep in step with jwt.refreshExpiresIn.
    maxAge: num(process.env.REFRESH_COOKIE_MAX_AGE_MS, 30 * 24 * 60 * 60 * 1000),
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_FOLDER || 'humovare',
    get isConfigured() {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },

  /**
   * Transactional email. The API key is read here and nowhere else, and is
   * never included in a response, a log line or an audit entry.
   *
   * `transport` picks the delivery path:
   *   resend   — real delivery through Resend (default when a key is set)
   *   preview  — writes each email to server/.email-previews/ (development
   *              only, when no key is set)
   *   memory   — keeps emails in process for the test suites
   *   disabled — records the event as skipped and sends nothing
   */
  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@humovare.in',
    fromName: process.env.RESEND_FROM_NAME || 'HUMOVARE',
    replyTo: process.env.RESEND_REPLY_TO || 'support@humovare.in',
    supportEmail: process.env.SUPPORT_EMAIL || process.env.RESEND_REPLY_TO || 'support@humovare.in',
    logoUrl: process.env.EMAIL_LOGO_URL || '',
    get transport() {
      const explicit = (process.env.EMAIL_TRANSPORT || '').toLowerCase();
      if (explicit) return explicit;
      if (this.resendApiKey) return 'resend';
      return process.env.NODE_ENV === 'production' ? 'disabled' : 'preview';
    },
    get from() {
      return `${this.fromName} <${this.fromEmail}>`;
    },
    /**
     * Outside production, real delivery only goes to these recipients —
     * exact addresses or `*@domain`. Everyone else is written to the local
     * preview folder instead. The seed creates customers on domains the shop
     * does not own, and a developer testing checkout must not email them.
     */
    devAllowlist: list(process.env.EMAIL_DEV_ALLOWLIST || '*@resend.dev'),
    /** Deferred retries for failed sends; the worker lives in server.js. */
    retryWorker: bool(process.env.EMAIL_RETRY_WORKER, true),
    retryIntervalMs: num(process.env.EMAIL_RETRY_INTERVAL_MINUTES, 5) * 60 * 1000,
  },

  /**
   * "Sign in with Google". The client ID is public — the storefront reads it
   * from GET /api/auth/providers — and there is no client secret: the
   * storefront receives a signed ID token, and this server checks the
   * signature and that the token was issued for this client ID.
   */
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  },

  /**
   * How long an admin activity entry is kept before it is permanently
   * deleted, to bound how much the audit trail grows. Each entry gets its
   * expiry baked in when it is written (see AuditLog's `expiresAt`), so
   * changing this only affects entries written from now on — it does not
   * retroactively shorten or extend the expiry already set on older ones.
   */
  auditLog: {
    retentionDays: Math.min(Math.max(num(process.env.AUDIT_LOG_RETENTION_DAYS, 3), 1), 3650),
  },

  /**
   * Online payment. Only one real gateway exists, PhonePe; when it is not
   * configured, checkout simply offers Cash on Delivery and nothing else.
   */
  payment: {
    /** How long an unpaid online order holds its stock before it is released. */
    windowMinutes: Math.min(Math.max(num(process.env.PAYMENT_WINDOW_MINUTES, 30), 10), 180),
    /** Background re-checks of unfinished payments. */
    reconciler: bool(process.env.PAYMENT_RECONCILER, true),
    reconcileIntervalMs: num(process.env.PAYMENT_RECONCILE_INTERVAL_SECONDS, 120) * 1000,
  },

  /**
   * PhonePe Standard Checkout (API v2). Server-side only — nothing here is
   * ever sent to a browser. `PHONEPE_ENV` must be set explicitly: there is no
   * default, so nothing can drift from sandbox to production by accident.
   */
  phonepe: {
    env: (process.env.PHONEPE_ENV || '').trim().toLowerCase(),
    clientId: (process.env.PHONEPE_CLIENT_ID || '').trim(),
    clientSecret: (process.env.PHONEPE_CLIENT_SECRET || '').trim(),
    clientVersion: (process.env.PHONEPE_CLIENT_VERSION || '1').trim(),
    /** Set on the PhonePe dashboard when the webhook is created. */
    webhookUsername: (process.env.PHONEPE_WEBHOOK_USERNAME || '').trim(),
    webhookPassword: (process.env.PHONEPE_WEBHOOK_PASSWORD || '').trim(),
    /** Seconds each checkout link stays valid: PhonePe allows 300–3600. */
    attemptExpirySeconds: Math.min(Math.max(num(process.env.PHONEPE_ATTEMPT_EXPIRY_SECONDS, 900), 300), 3600),
    requestTimeoutMs: num(process.env.PHONEPE_TIMEOUT_MS, 10_000),
    get isValidEnv() {
      return this.env === 'sandbox' || this.env === 'production';
    },
    get isConfigured() {
      return this.isValidEnv && Boolean(this.clientId && this.clientSecret);
    },
    get webhookConfigured() {
      return Boolean(this.webhookUsername && this.webhookPassword);
    },
  },

  commerce: {
    freeShippingThreshold: num(process.env.FREE_SHIPPING_THRESHOLD, 999),
    shippingFee: num(process.env.SHIPPING_FEE, 79),
    currency: process.env.CURRENCY || 'INR',
  },

  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MINUTES, 15) * 60 * 1000,
    max: num(process.env.RATE_LIMIT_MAX, 300),
  },

  /** Proxy hops to trust: false, or a count (true means 1). */
  trustProxy: (() => {
    const raw = (process.env.TRUST_PROXY ?? '').trim().toLowerCase();
    if (raw === '') return process.env.NODE_ENV === 'production' ? 1 : false;
    if (raw === 'false' || raw === '0') return false;
    if (raw === 'true') return 1;
    const hops = Number(raw);
    return Number.isInteger(hops) && hops > 0 ? hops : false;
  })(),
};

const PLACEHOLDER = /replace-with|<user>|<password>|<cluster>/i;

/**
 * Fail fast on boot when something required is missing or still a placeholder.
 * Secrets are never printed — only the names of the offending variables.
 */
export function assertEnv() {
  const required = [
    ['MONGODB_URI', env.mongoUri],
    ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
    ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
    ['ADMIN_JWT_ACCESS_SECRET', env.adminJwt.accessSecret],
    ['ADMIN_JWT_REFRESH_SECRET', env.adminJwt.refreshSecret],
  ];

  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  const placeholders = required
    .filter(([, value]) => value && PLACEHOLDER.test(value))
    .map(([name]) => name);

  // Every secret must be distinct: sharing one would let a token minted for
  // one purpose be replayed as another.
  const secrets = {
    JWT_ACCESS_SECRET: env.jwt.accessSecret,
    JWT_REFRESH_SECRET: env.jwt.refreshSecret,
    ADMIN_JWT_ACCESS_SECRET: env.adminJwt.accessSecret,
    ADMIN_JWT_REFRESH_SECRET: env.adminJwt.refreshSecret,
  };
  const seen = new Map();
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) continue;
    if (seen.has(value)) {
      placeholders.push(`${name} (must differ from ${seen.get(value)})`);
    } else {
      seen.set(value, name);
    }
  }

  if (missing.length || placeholders.length) {
    const lines = ['Invalid environment configuration:'];
    if (missing.length) lines.push(`  • missing: ${missing.join(', ')}`);
    if (placeholders.length) lines.push(`  • still placeholder: ${placeholders.join(', ')}`);
    lines.push('  → copy server/.env.example to server/.env and fill in real values.');
    throw new Error(lines.join('\n'));
  }

  // Short admin secrets can be brute-forced offline from any captured token.
  if (env.isProd) {
    for (const [name, value] of Object.entries(secrets)) {
      if (value && value.length < 32) placeholders.push(`${name} (must be at least 32 characters in production)`);
    }
    if (placeholders.length) {
      throw new Error(`Invalid environment configuration:\n  • weak secret: ${placeholders.join(', ')}`);
    }
  }

  if (env.isProd && !env.cloudinary.isConfigured) {
    console.warn('[env] Cloudinary is not configured — image uploads will be rejected.');
  }

  // A missing mail key must not stop the shop taking orders, so these warn
  // rather than fail. Every unsent email is still recorded, and retryable once
  // the key is in place.
  if (env.isProd && env.email.transport !== 'resend') {
    console.warn(`[env] Email transport is "${env.email.transport}" — customers will not receive emails. Set RESEND_API_KEY.`);
  }
  if (env.isProd && !/^https:\/\//.test(env.frontendUrl)) {
    console.warn('[env] FRONTEND_URL is not https — links in customer emails will be insecure.');
  }

  // PhonePe. Misconfiguration disables online payment rather than stopping
  // the shop: Cash on Delivery keeps working.
  const pp = env.phonepe;
  if (pp.env && !pp.isValidEnv) {
    console.warn(`[env] PHONEPE_ENV="${pp.env}" is not "sandbox" or "production" — online payment is disabled.`);
  }
  if (pp.isValidEnv && !(pp.clientId && pp.clientSecret)) {
    console.warn('[env] PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET are not set — online payment is disabled.');
  }
  if (pp.isConfigured && !pp.webhookConfigured) {
    console.warn('[env] PHONEPE_WEBHOOK_USERNAME / PASSWORD are not set — webhooks will be refused; payments are confirmed by status checks only.');
  }
  if (env.isProd && pp.env === 'sandbox') {
    console.warn('[env] PHONEPE_ENV=sandbox in production — customers cannot make real payments.');
  }
  if (!env.isProd && pp.env === 'production') {
    console.warn('[env] PHONEPE_ENV=production outside production — real money will move.');
  }
  if (env.isProd && pp.isConfigured && !/^https:\/\//.test(env.frontendUrl)) {
    console.warn('[env] FRONTEND_URL is not https — PhonePe payments are refused until it is.');
  }
}

export default env;
