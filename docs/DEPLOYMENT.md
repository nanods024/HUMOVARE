# Deploying HUMOVARE

The client is a static bundle; the API is a long-running Node process. They can
live on one domain or two — the only thing that changes is CORS and cookie
configuration.

---

## 1. MongoDB Atlas

1. Create a cluster (M0 is fine to start) and a database named `humovare`.
2. **Database Access** → add a user with *Read and write to any database*. Use
   a generated password and URL-encode any special characters in the URI.
3. **Network Access** → allow your host's egress IPs. Avoid `0.0.0.0/0` in
   production; if your platform has no static IP, use its VPC peering or
   PrivateLink integration instead.
4. Copy the connection string into `MONGODB_URI`, including the database name:

   ```
   mongodb+srv://USER:PASSWORD@cluster.mongodb.net/humovare?retryWrites=true&w=majority
   ```

### Indexes

`autoIndex` is **off** in production — building indexes on boot is slow and can
lock a busy collection. Create them once, deliberately:

```bash
NODE_ENV=production npm run seed --workspace server
```

The seeder is an idempotent upsert and calls `ensureIndexes` for every model.
To create indexes without touching data, run it against a database that already
has your catalogue — existing products are updated in place, not duplicated.

---

## 2. Cloudinary

1. Create an account; note the **cloud name**, **API key** and **API secret**.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   and `CLOUDINARY_FOLDER=humovare` on the **server only**.
3. On the client, set `VITE_CLOUDINARY_CLOUD_NAME` — the cloud name is public
   and is used to build delivery URLs. **Never** expose the API secret to the
   browser; uploads always go through `POST /api/products/images`.

Images are capped at 2000px on ingest and delivered with `f_auto,q_auto` plus a
responsive `srcset`.

---

## 2a. Resend (email)

The `humovare.in` domain is already verified in Resend. On the **API host
only** (Render, Railway, Fly — never the static storefront host), set:

```bash
RESEND_API_KEY=re_…                     # sending access, restricted to humovare.in
RESEND_FROM_EMAIL=noreply@humovare.in
RESEND_FROM_NAME=HUMOVARE
RESEND_REPLY_TO=support@humovare.in
FRONTEND_URL=https://humovare.in
EMAIL_LOGO_URL=https://res.cloudinary.com/cxttszyw/image/upload/c_limit,w_360/q_auto/v1790237685/humovare/email/humovare-logo.png
```

Create the key in Resend → **API Keys** → *Create API key* → Permission
**Sending access**, Domain **humovare.in**. A sending-only key can send mail but
cannot read or change the account, so a leaked key is far less damaging.

**Never** set any of these on Vercel/Netlify or with a `VITE_` prefix —
anything the storefront build can read is shipped to every browser.

Keep `support@humovare.in` a real, monitored mailbox: every email's Reply-To
points there, and customers will reply.

Then run `npm run email:check --workspace server` once from a machine with the
production values, and see [EMAIL.md](EMAIL.md#in-production) for the manual
check.

---

## 2b. Sign in with Google

1. [Google Cloud Console](https://console.cloud.google.com/) → create or pick a
   project.
2. **APIs & Services → OAuth consent screen** → *External*. App name
   `HUMOVARE`, support email `humovare.in@gmail.com`, authorised domain
   `humovare.in`, links to `https://humovare.in/privacy` and `/terms`. Scopes:
   only the defaults (`openid`, `email`, `profile`). **Publish** the app — in
   *Testing* only listed test users can sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** →
   *Web application*. Under **Authorized JavaScript origins** add:
   - `http://localhost:5173` and `http://localhost` (development)
   - `https://humovare.in` and `https://www.humovare.in` (production)

   Redirect URIs are not needed — the button uses a popup.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into
   `GOOGLE_CLIENT_ID` in `server/.env` and on the API host, then restart the
   API. There is **no client secret** to set: the storefront receives a
   Google-signed ID token and the API verifies it.

The button appears on **Sign in** and **Create account** once the API reports
the client ID. If it says *"The given origin is not allowed"*, the exact
origin in the address bar (scheme, host and port) is missing from step 3; new
origins can take a few minutes to apply.

---

## 2c. PhonePe (online payment)

Follow [PAYMENTS.md](PAYMENTS.md): credentials on the **API host only**,
`PHONEPE_ENV` set explicitly, and a webhook on the PhonePe dashboard pointing
at `https://<api host>/api/payments/phonepe/webhook` with the same
username/password. Run `npm run payments:check --workspace server` against the
sandbox before going live.

---

## 3. Generate secrets

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 48   # ADMIN_JWT_ACCESS_SECRET
openssl rand -base64 48   # ADMIN_JWT_REFRESH_SECRET
```

All four must differ — the server refuses to boot if any pair matches. The
admin secrets being separate is what makes a customer token useless against an
admin route even before the `typ` claim is checked.

Rotating a refresh secret signs every existing session of that kind out, which
is the intended emergency lever; rotating the admin one does not touch
customers.

Keep every secret in the host's secret store, not in the repository. The only
`.env` that belongs in git is `.env.example`.

---

## 4. Deploy the API

Any Node host works (Render, Railway, Fly, a VPS, ECS). It needs a
long-running process — the API is stateful in memory only for rate limiting, so
it scales horizontally without sticky sessions.

**Build:** none required (plain ESM). **Start:** `npm start --workspace server`
**Health check path:** `/health`

Production environment:

```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
CLIENT_URL=https://humovare.com
CORS_ORIGINS=https://www.humovare.com
COOKIE_DOMAIN=.humovare.com
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
PHONEPE_ENV=production            # sandbox until you go live
PHONEPE_CLIENT_ID=...             # Live-mode credentials — never the sandbox ones
PHONEPE_CLIENT_SECRET=...
PHONEPE_CLIENT_VERSION=1
PHONEPE_WEBHOOK_USERNAME=...
PHONEPE_WEBHOOK_PASSWORD=...
TRUST_PROXY=true
FREE_SHIPPING_THRESHOLD=999
SHIPPING_FEE=79
```

### Behind a proxy

Set `TRUST_PROXY=true` (the default in production) so Express reads
`X-Forwarded-For`. Without it every request appears to come from the load
balancer, which breaks rate limiting and secure-cookie detection.

### CORS

`CLIENT_URL` and `ADMIN_URL` are the allowed origins, plus anything listed in
`CORS_ORIGINS`. Credentials are enabled, so the wildcard is not merely
discouraged — the browser rejects `Access-Control-Allow-Origin: *` on a
credentialed request. Set these to the exact production origins.

### Cookies across subdomains

In production the refresh cookie is `Secure`, `SameSite=None`, `HttpOnly`,
scoped to `/api/auth`. That combination **requires HTTPS on both origins**.

- Same domain (`humovare.com` + `humovare.com/api`) — leave `COOKIE_DOMAIN`
  blank; simplest and most robust.
- Split subdomains (`www.` + `api.`) — set `COOKIE_DOMAIN=.humovare.com` and
  list every storefront origin in `CORS_ORIGINS`.
- Different registrable domains — the refresh cookie will be treated as
  third-party and dropped by most browsers. Put the API behind a path on the
  storefront domain instead.

The **admin** cookies are stricter: `Secure`, `HttpOnly`, `SameSite=Strict`,
scoped to `Path=/api/admin`. Strict means the browser never attaches them to a
cross-site request, which is the first layer of CSRF defence behind the
double-submit token. It requires the admin app to be served from the same site
as the API — `/admin` on the storefront domain, or an `admin.` subdomain (a
subdomain is still same-site). If you must host the admin app on a different
registrable domain, `sameSite` in `server/src/utils/adminToken.js` has to
become `none`, and you lose that layer.

---

## 5. Deploy the client

Static host (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront).

```
Build command:      npm run build
Output directory:   dist
Install command:    npm install
Node version:       18.18+
```

`npm run build` builds both front ends and copies the admin build into
`dist/admin`, so a single static directory serves everything. The
admin app is built with `base: '/admin/'`, and serving it from the storefront
origin is what keeps the admin cookies same-site.

Two routing rules are needed on top of the storefront's:

```
/admin        →  301 /admin/            (redirect, not a rewrite)
/admin/*      →  /admin/index.html  200 (SPA fallback, before the storefront's)
```

Without the first, `https://humovare.com/admin` misses the directory index.
Without the second — and without it being matched *before* the storefront's
own `/*` catch-all — a refresh on `/admin/products` renders the shop's 404.

On Netlify, in `shop/public/_redirects`, above the storefront rule:

```
/admin        /admin/            301
/admin/*      /admin/index.html  200
```

In development `npm run dev` handles both: the storefront proxies `/admin` to
the admin dev server on port 5174, so http://localhost:5173/admin is the same
URL you will use in production.

Environment:

```bash
VITE_API_URL=https://api.humovare.com/api
VITE_SITE_URL=https://humovare.com
VITE_CLOUDINARY_CLOUD_NAME=your-cloud
```

`VITE_*` values are **baked into the bundle at build time** and are public.
Never put a secret in one — in particular `CLOUDINARY_API_SECRET` and the
MongoDB URI are server-only. Changing them requires a rebuild, not a restart.

The admin app takes `VITE_API_URL` and `VITE_SITE_URL` (the "view storefront"
link) and nothing else. Image uploads work without a Cloudinary secret in the
browser: the server mints a short-lived signature, the browser uploads with it,
and the server re-verifies Cloudinary's response before storing the asset.

### SPA rewrites

Client-side routing means every unknown path must serve `index.html`, or a
refresh on `/product/some-slug` returns 404.

**Netlify** — `shop/public/_redirects`:

```
/*  /index.html  200
```

**Vercel** — `vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

**Nginx**:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}

# Hashed assets are immutable; index.html must never be cached.
location /assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /index.html {
  add_header Cache-Control "no-cache";
}
```

---

## 6. Post-deploy checklist

- [ ] `GET /health` returns `200`
- [ ] Storefront loads and the product grid populates
- [ ] A product page loads directly by URL (confirms SPA rewrites)
- [ ] Register, sign out, sign in again — then hard-refresh and confirm you are
      still signed in (confirms the refresh cookie)
- [ ] Add to bag as a guest, sign in, confirm the bag merged
- [ ] Place a COD order end to end
- [ ] **Change the seeded `admin@humovare.com` and `demo@humovare.com` passwords**
- [ ] **Sign in at `/admin` as the seeded super admin and change that password**
      (the account is flagged `mustChangePassword`)
- [ ] Confirm `/admin` loads and an unauthenticated visit redirects to the
      sign-in page
- [ ] Confirm `GET /api/admin/dashboard` returns `401` with no cookies, and
      `403` when called with a *customer* access token
- [ ] Confirm a mutation without `X-CSRF-Token` returns `403`
- [ ] Edit a home page section in the admin and confirm the storefront shows it
      after a refresh, with no redeploy
- [ ] Confirm `CLIENT_URL` and `ADMIN_URL` are the exact production origins
- [ ] Boot log shows `Email transport: resend · from HUMOVARE <noreply@humovare.in>`
      with no email warnings
- [ ] `RESEND_API_KEY` is a **sending access** key restricted to `humovare.in`
- [ ] Boot log shows `Online payment: PhonePe (production)` with no warnings;
      production PhonePe credentials are not the sandbox ones
- [ ] PhonePe Live-mode webhook created, pointing at the production API
- [ ] One real low-value PhonePe payment, end to end (see PAYMENTS.md)
- [ ] `GOOGLE_CLIENT_ID` set; `https://humovare.in` is an authorised JavaScript
      origin; the OAuth consent screen is **published**; "Continue with Google"
      works on the live sign-in page
- [ ] `FRONTEND_URL=https://humovare.in` — open a reset email and confirm the
      link is https and lands on the live site
- [ ] Request a password reset for your own account; confirm it arrives, the
      link works once, and a second click is refused
- [ ] Place a COD order; confirm the confirmation email arrives with the logo
- [ ] Move that order through the statuses in the admin; one email each, all
      listed under **Customer emails** with a Resend message id
- [ ] In the Resend dashboard, confirm From `HUMOVARE <noreply@humovare.in>`
      and Reply-To `support@humovare.in` on a sent email
- [ ] Open one email on a phone (Gmail) and in desktop Outlook
- [ ] Confirm `.env` is not in the repository
- [ ] Confirm a `500` returns a generic message with no stack trace
- [ ] Update `SITE_URL`, `robots.txt` and the canonical host
- [ ] Replace placeholder imagery with real photography
- [ ] Point `SEED_IMAGE_BASE` at your Cloudinary folder

---

## 7. Sitemap

`public/robots.txt` already references `/sitemap.xml` and excludes cart,
checkout, account and search.

All the data a sitemap needs is available from the public API — every product
slug from `GET /api/products?limit=60` (paginate), every category slug from
`GET /api/categories` and every collection from `GET /api/collections`. Generate it as a build step and write it to
`shop/public/sitemap.xml`, or serve it from the API if the catalogue changes
more often than you deploy.

---

## 8. Operations

**Logs** — production emits single-line JSON (level, time, message) for
CloudWatch, Datadog or Loki. `LOG_LEVEL` accepts `error`, `warn`, `info`,
`debug`.

**Shutdown** — `SIGTERM` stops accepting connections, lets in-flight requests
finish, closes MongoDB, then exits, with a 10-second hard timeout. Give your
platform at least 15 seconds of grace so a checkout is never cut mid-flight.

**Backups** — enable Atlas continuous backups before taking real orders.
Orders are the one collection you cannot reconstruct.

**Scaling** — the API is stateless; run several instances behind a load
balancer. Note that rate limiting is per-instance (in-memory); if you need it
enforced globally, move the store to Redis.
