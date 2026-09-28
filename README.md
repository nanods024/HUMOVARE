# HUMOVARE

Premium menswear e-commerce storefront and admin portal.

A production-shaped MERN monorepo: a React + TypeScript storefront, a separate
RBAC admin portal, and a layered Express/MongoDB API — authentication, cart,
wishlist, checkout, orders and admin-managed storefront content all working
end to end.

```
humovare/
├── shop/       Storefront · React 18 · Vite · TypeScript · Tailwind · TanStack Query · Zustand
├── admin/      Admin portal · same stack + Recharts, served at /admin
├── server/     Node · Express · Mongoose · JWT · Cloudinary · Zod
├── docs/       API reference, admin architecture and deployment guide
└── package.json (npm workspaces)
```

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure

```bash
cp server/.env.example server/.env
cp shop/.env.example shop/.env
```

Fill in `server/.env`:

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | yes | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | yes | Long random string — `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | yes | Must differ from the access secret |
| `CLIENT_URL` | yes | Storefront origin, for CORS and cookies |
| `CLOUDINARY_*` | for uploads | Product image upload and delivery |
| `PHONEPE_ENV` | for online payment | `sandbox` or `production` — no default. See [docs/PAYMENTS.md](docs/PAYMENTS.md) |
| `PHONEPE_CLIENT_ID` / `PHONEPE_CLIENT_SECRET` | for online payment | Server only. Sandbox and production credentials are different |
| `PHONEPE_WEBHOOK_USERNAME` / `PASSWORD` | for webhooks | The same values entered on the PhonePe webhook |
| `ADMIN_JWT_ACCESS_SECRET` | yes | Admin tokens are signed separately — must differ from the customer secrets |
| `ADMIN_JWT_REFRESH_SECRET` | yes | Must differ from every other secret |
| `ADMIN_URL` | yes | Admin origin, for CORS |
| `RESEND_API_KEY` | for email | Server only. A sending-access key restricted to `humovare.in` |
| `FRONTEND_URL` | for email | Base for links in emails — `https://humovare.in` in production |
| `GOOGLE_CLIENT_ID` | for Google sign-in | Public OAuth Web client ID. Blank hides the Google button |

The server validates these on boot and refuses to start with missing or
placeholder values, naming the offending variables (never their contents).

### 3. Seed the catalogue

```bash
npm run seed
```

Creates 12 categories, 18 menswear products and two demo accounts:

| Account | Email | Password |
| --- | --- | --- |
| Admin | `admin@humovare.com` | `Humovare@2025` |
| Customer | `demo@humovare.com` | `Humovare@2025` |

It also creates the first super admin, the seeded home page sections and the
shop page configuration:

| Account | Email | Password |
| --- | --- | --- |
| Super admin | `owner@humovare.in` | `Humovare@Admin2025` |

The super admin is flagged `mustChangePassword`, so the portal asks for a new
password on first sign-in.

> Change all of these before any public deployment. Override with
> `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and `SEED_SUPER_ADMIN_EMAIL` /
> `SEED_SUPER_ADMIN_PASSWORD`.

### 4. Run

```bash
npm run dev
```

- Storefront → http://localhost:5173
- Admin portal → http://localhost:5174/admin
- API → http://localhost:5000
- Health check → http://localhost:5000/health

Vite proxies `/api` to the server in development, so the browser stays
same-origin and the refresh cookie behaves exactly as it will in production.

### No MongoDB to hand?

```bash
npm run dev:standalone --workspace server
```

Boots the full API against a throwaway in-memory MongoDB, seeded on start and
discarded on exit. Nothing can touch a real database.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Client and server together |
| `npm run build` | Both front ends into one `dist/` folder (shop at `/`, admin at `/admin`) |
| `npm run build:shop` / `npm run build:admin` | One front end only |
| `npm start` | Production API |
| `npm run seed` | Seed a fresh database. **Rewrites the 18 seeded products**, so do not run it on a database with real edits |
| `npm run seed:admin` | Safe upgrade: brings roles, home page sections and shop config in step with the code, without touching the catalogue |
| `npm run seed:fresh --workspace server` | Wipe the catalogue, then seed |
| `npm run lint` | Lint both workspaces |
| `npm run format` | Prettier across the repo |
| `npm run typecheck --workspace shop` | TypeScript, no emit |
| `npm run test:smoke --workspace server` | 62-assertion storefront API test |
| `npm run test:admin --workspace server` | 125-assertion admin API and security test |
| `npm run test:email --workspace server` | 153-assertion transactional email test (no network) |
| `npm run email:check --workspace server` | Sends every template through Resend to its test inbox and verifies delivery |
| `npm run test:payments --workspace server` | 128-check PhonePe payment test (real client, PhonePe test double, no network) |
| `npm run payments:check --workspace server` | Talks to the **real PhonePe sandbox**: token, a ₹1 test payment, status |
| `npm test --workspace server` | All four suites |

### After pulling changes

```bash
npm run seed:admin
```

New home page section types and shop filters live in the database, not just in
the code, so a database seeded by an earlier version needs one command to catch
up. It inserts anything missing at the position the seed intends, retires
filters the storefront no longer implements, and leaves every label, ordering
and enabled/disabled choice an admin has made alone. Running it twice does
nothing the second time.

Use it rather than `npm run seed` on any database with real data: the full seed
rewrites the seeded products from `seed/data.js` and would undo price, stock or
imagery changes.

### The smoke test

`npm run test:smoke --workspace server` spins up an in-memory MongoDB, seeds
it, boots the real Express app and walks the whole journey — browse, filter,
sort, search, register, wishlist, cart, guest-cart merge, address, COD
checkout, stock decrement, order history, cancellation and stock restoration —
plus authorisation and NoSQL-injection checks. It touches nothing external.

`npm run test:admin --workspace server` does the same for the admin API, and
spends most of its assertions on the security model rather than the happy
path: anonymous access, a customer token replayed against an admin route,
missing and mismatched CSRF tokens, per-role permission denial, instant
revocation when an admin is disabled, account lockout, audit completeness and
redaction, and that the storefront still serves customers throughout. It also
asserts that every seeded home page section type has a renderer in the
storefront, so the admin can never edit something customers cannot see.

---

## Architecture

### Backend — layered, thin controllers

```
server/src/
├── config/       env (validated), db, cloudinary
├── models/       Mongoose schemas + indexes
├── services/     ALL business logic
├── controllers/  HTTP in, HTTP out — nothing else
├── routes/       wiring, per-route validation and rate limits
├── validators/   Zod schemas
├── middleware/   auth, validation/sanitising, rate limits, errors, uploads
├── utils/        response envelope, pagination, slugs, money, tokens, indexes
└── seed/         catalogue data + seeder
```

Controllers never contain business rules. Anything that reasons about stock,
pricing or ownership lives in a service, so the storefront and the admin API
share one implementation rather than two that drift.

### Key decisions

**Stock is held on the variant, not the product.** A size/colour pair is the
thing that is actually sold, so two sizes of one tee cannot oversell each other.

**Checkout reserves stock atomically.** Each line uses a guarded update:

```js
{ variants: { $elemMatch: { _id: variantId, stock: { $gte: quantity } } } }
```

Two concurrent checkouts for the last unit cannot both match — the second gets
`null` back and every reservation already taken is released. This holds without
a replica set, which `session.withTransaction` would have required.

**Order lines are snapshots, not references.** A product can be renamed,
repriced or retired later; the order still renders exactly as it was placed.

**Guest carts merge, they do not overwrite.** The client posts its localStorage
lines once at sign-in. Every line is re-resolved against the live catalogue, so
a tampered local cart cannot buy at the wrong price — and a line that fails
validation is skipped with a reason rather than failing the whole merge.

**The access token never touches storage.** It lives in memory only; the
refresh token is an HTTP-only cookie scoped to `/api/auth`. A `tokenVersion`
column invalidates every issued refresh token at once on password change.

**Admins are a separate identity namespace.** `AdminUser` is its own
collection, admin tokens are signed with their own secrets and carry a
`typ: 'admin'` claim, and both live in HTTP-only cookies paired with a
double-submit CSRF token. A customer token fails an admin route twice over —
wrong signature, wrong type — and promoting yourself by editing localStorage is
not possible, because nothing about identity is read from there. Every admin
route independently re-checks authentication, admin status, role, permission
and request shape; the sidebar hiding a link is a convenience, never the
control.

### Frontend

```
shop/src/
├── api/          axios client (single-flight refresh) + typed endpoints
├── components/   ui · layout · product · shop · cart · home · account · common
├── hooks/        useAuth, useCart, useWishlist, useProductSelection, useSeo …
├── layouts/      Root, Account, Checkout
├── pages/        one folder per route group
├── store/        Zustand — auth, guest cart, UI, toasts, recently viewed
├── styles/       theme.css — the brand tokens
└── routes/       route map
```

**Server state lives in TanStack Query. Client state lives in Zustand.** API
responses are never copied into a global store.

`useCart()` presents one interface for guests and signed-in shoppers; the
branch between localStorage and the API is made once, in the hook.

**The Instagram wall is links, not uploads.** The community section on the
home page holds Instagram post permalinks, and each one is rendered by
Instagram's own embed — their photo, their video, their handle and like count.
That is the only way a reel can actually play on the page, and it means adding
a post is a paste rather than a download-and-re-upload. The row of iframes is
the heaviest thing on the home page, so it loads only once the section is near
the viewport, with a timer behind the observer so it can never be stranded.

**Customer email goes out at most once, and can never break an order.** Every
email is keyed by what it is about — `order:<id>:status:SHIPPED` — and claimed
atomically before sending, so a retried request, a replayed payment callback or
an admin double-click cannot send it twice. A failed send is recorded and
retried, never thrown. See [docs/EMAIL.md](docs/EMAIL.md).

**The contact form has an inbox, not a mailbox.** Messages are stored and
triaged in the admin rather than emailed, because an inbox someone owns is more
reliable than mail that depends on a provider being configured. Replies go out
from the shop's own mail client.

**Storefront content is admin-managed, with the static layout as the fallback.**
The home page renders from `GET /api/homepage` and the shop page reads
`GET /api/shop-config`; every component keeps its current copy and imagery as
default props, so an empty or unreachable CMS renders exactly the page that was
hand-built. Content changes go live on the next request — no redeploy.

### Admin portal

```
admin/src/
├── api/          cookie-auth client, CSRF header, single-flight refresh
├── components/   ui kit · guards · permission-aware Can
├── hooks/        useAdminAuth, usePermission, useTableQuery, useDebounce
├── layouts/      AdminLayout — sidebar filtered by permission
├── pages/        Auth · Dashboard · Catalog · Storefront · Operations · Administration
└── routes/       basename '/admin', every route behind RequirePermission
```

Built and served under `/admin` on the storefront domain, so admin cookies are
same-origin and never cross-site.

---

## Design system

Every colour is a CSS custom property in **`shop/src/styles/theme.css`** —
the single place to retune the brand:

```css
--color-primary: 200 22 29;  /* #C8161D */
```

Tailwind reads them as `rgb(var(--token) / <alpha-value>)`, so opacity
utilities (`bg-primary/10`) keep working.

Red is an accent, never the canvas: primary CTAs, sale badges, active states,
the wishlist heart. White, warm off-white and a warm near-black carry the page.

`.on-dark` re-scopes the neutral tokens for the inverted editorial blocks (the
quality story) so every component works inside them unchanged. `--color-black`
is the *maximum-contrast slab* rather than a literal colour, so a selected
pill (`bg-ink-black text-canvas`) reads correctly in both scopes.

### Navigation

The catalogue sits behind a single **Shop** entry in the header, which opens a
full-width mega menu: categories, discovery links and category imagery. The
range is menswear-only, so navigation is organised by product type rather than
by gender — `/men` and `/women` redirect to `/shop` so older links still work.

The mega menu and the hero entrance are **CSS-driven, not JS-driven**. A
reveal that starts at `opacity: 0` and waits on an animation frame leaves
content invisible if that frame never comes; a class toggle always lands in
the right state. `Reveal` (scroll-in sections) additionally force-shows after
1.5s as a failsafe.

---

## Payments

Cash on Delivery, and online payment through **PhonePe Standard Checkout
(v2)** — sandbox now, production by changing `PHONEPE_ENV` and the
credentials. There is no mock or simulated payment path.

An order is marked paid only after the server asks PhonePe's status API
itself; webhooks and the return page are only prompts. Duplicate or
simultaneous callbacks change nothing twice and send each email once.
Abandoned payments release their stock once PhonePe confirms they expired.
The shop does not issue refunds.

Everything — setup, webhook, states, testing, production checklist
— is in [docs/PAYMENTS.md](docs/PAYMENTS.md).

---

## Performance

- Route-level code splitting; only the homepage is eager
- Vendor chunks split by concern (react / router / query / motion / forms)
- Cloudinary `f_auto,q_auto` plus a responsive `srcset`
- Every image sits in a fixed aspect box — no layout shift as the grid fills
- Server-side filtering, sorting and pagination against compound indexes
- Weighted text index behind search; requests debounced 300ms
- gzip compression, skeleton loaders, optimistic wishlist toggles
- Above-the-fold hero entrance is CSS, not JS, so it cannot be left invisible

## SEO

Semantic landmarks, one `h1` per page, per-route titles, meta descriptions,
Open Graph and Twitter cards, canonical URLs, and JSON-LD for `Organization`,
`WebSite`, `BreadcrumbList`, `Product` (price + availability) and `FAQPage`.
Clean slugs throughout — `/product/humovare-core-oversized-tee`, never
`/product?id=123`. Cart, checkout, account and search are `noindex`.

## Accessibility

Keyboard-navigable throughout with visible focus rings, focus-trapped dialogs
that restore focus on close, `aria-live` regions for toasts and result counts,
labelled form controls with `aria-describedby` errors, and a global
`prefers-reduced-motion` rule.

---

## Documentation

- [API reference](docs/API.md) — every endpoint, payload and error
- [Admin architecture](docs/ADMIN-ARCHITECTURE.md) — data model, module map, API contract, security model
- [Online payment — PhonePe](docs/PAYMENTS.md) — setup, webhook, states, testing, go-live
- [Transactional email](docs/EMAIL.md) — Resend, templates, duplicate protection, retries, testing
- [Deployment guide](docs/DEPLOYMENT.md) — Atlas, Cloudinary, Resend, hosting, checklist

## Phase 2

Deliberately out of scope here, with extension points left in place: online
payment drivers, coupons, recommendations, and admin MFA (the field and the
flag exist; no enrolment flow yet).

---

## Credits

Original design, copy and branding for HUMOVARE. Product imagery is
placeholder-generated; replace `SEED_IMAGE_BASE` and the Cloudinary folder with
real photography before launch.
