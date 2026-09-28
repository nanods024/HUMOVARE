# HUMOVARE API reference

Base URL: `http://localhost:5000/api` (development)

## Conventions

### Response envelope

Every response uses the same shape, so clients branch on `success` alone.

**Success**

```json
{ "success": true, "message": "Products fetched successfully", "data": { } }
```

**Error**

```json
{ "success": false, "message": "Email or password is incorrect", "error": "ApiError" }
```

Validation failures return `422` with a per-field array:

```json
{
  "success": false,
  "message": "Validation failed",
  "error": [{ "field": "email", "message": "Enter a valid email address" }]
}
```

In production the `error` field is omitted for `5xx` responses and the message
is replaced with a generic one — stack traces are never sent to a client.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` / `201` | Success |
| `400` | Malformed request |
| `401` | Not signed in, or the token expired |
| `403` | Signed in but not permitted |
| `404` | Not found |
| `409` | Conflict — duplicate email, sold out, already cancelled |
| `422` | Validation failed |
| `429` | Rate limited |
| `500` / `502` | Server or upstream (Cloudinary) failure |

### Authentication

Two tokens:

- **Access token** — short-lived (15m), returned in the response body, sent as
  `Authorization: Bearer <token>`. Keep it in memory only.
- **Refresh token** — 30 days, set as an HTTP-only cookie (`hv_refresh`) scoped
  to `/api/auth`. Never readable by JavaScript.

Requests must be sent with credentials (`withCredentials: true`) so the cookie
travels with `/api/auth` calls.

On a `401`, call `POST /api/auth/refresh` once and retry. Coalesce concurrent
refreshes — the endpoint rotates the token, so parallel calls invalidate
each other.

### Rate limits

| Scope | Window | Max |
| --- | --- | --- |
| All `/api` | 15 min | 300 |
| `/auth/login`, `/auth/register` | 15 min | 10 (successful ones not counted) |
| Password reset | 1 hour | 5 |
| Product search | 1 min | 90 |
| Writes (orders, admin) | 1 min | 40 |

---

## Auth

### `POST /api/auth/register`

```json
{ "name": "Aarav Mehta", "email": "aarav@example.com", "password": "Humovare@2025", "phone": "9876543210" }
```

Password must be 8–72 characters with at least one letter and one number.
`phone` is optional.

→ `201` `{ user, accessToken }` · sets the refresh cookie
→ `409` if the email already exists

### `POST /api/auth/login`

```json
{ "email": "aarav@example.com", "password": "Humovare@2025" }
```

→ `200` `{ user, accessToken }`
→ `401` `"Email or password is incorrect"` — deliberately identical for an
unknown email and a wrong password, so the endpoint cannot enumerate accounts.

### `POST /api/auth/google`

```json
{ "credential": "<Google ID token from the Sign in with Google button>" }
```

Verifies the token with Google (signature, issuer, expiry, and that it was
issued for `GOOGLE_CLIENT_ID`), then:

- signs in the account already linked to that Google account — `200`;
- otherwise links an existing account with the same email, only when Google
  is the authority for the address (`@gmail.com`, or a Workspace domain Google
  reports as hosted) — `200`;
- otherwise creates a customer account (Gmail only, same rule as register) and
  sends the welcome email — `201`.

Returns the same body as login plus `created`, and sets the refresh cookie.
`401` if the token does not verify or its email is unverified, `409` if the
email belongs to an account Google cannot vouch for or that is linked to a
different Google account, `403` for deactivated accounts. Rate limited like
login.

Accounts created this way have no password; `change-password` explains that,
and "Forgot password" lets the customer set one.

### `GET /api/auth/providers`

`{ "google": { "clientId": "…apps.googleusercontent.com" } }`, or
`{ "google": null }` when Google sign-in is not configured.

### `POST /api/auth/refresh`

Reads the refresh cookie; no body. → `200` `{ user, accessToken }`

### `POST /api/auth/logout`

Clears the cookie and increments `tokenVersion`, invalidating every refresh
token issued to that account.

### `GET /api/auth/me` 🔒

→ `{ user }`

### `POST /api/auth/forgot-password`

```json
{ "email": "aarav@example.com" }
```

Always returns `200` with the same body — `{ "sent": true }` — whether or not
the address is registered. The reset link is only ever delivered by email; it
is never in the response or the logs. The email is sent off the request path,
so response time does not reveal whether an account exists.

Rate limited to 5 requests an hour per IP, and to one reset email a minute and
five an hour per account.

### `POST /api/auth/reset-password`

```json
{ "token": "<raw token>", "password": "NewPassword1" }
```

The token is single-use (claimed and cleared atomically, so two requests with
the same link cannot both succeed), expires in 30 minutes, and only its
SHA-256 hash is stored. A successful reset invalidates all existing sessions.

### `POST /api/auth/change-password` 🔒

```json
{ "currentPassword": "…", "newPassword": "…" }
```

→ `{ user, accessToken }` and a rotated refresh cookie.

---

## Products

### `GET /api/products`

Server-side filtering, sorting and pagination. The client never receives more
than one page.

| Param | Type | Notes |
| --- | --- | --- |
| `page` | int | default `1` |
| `limit` | int | default `24`, max `60` |
| `category` | slug | real category, e.g. `t-shirts` |
| `collection` | slug | virtual collection — `new-drops`, `bestsellers`, `sale`, `featured` |
| `gender` | enum | `men` (HUMOVARE is a menswear label) |
| `size` | csv / repeated | `?size=L&size=XL` or `?size=L,XL` |
| `color` | csv / repeated | colour slug, e.g. `jet-black` |
| `fit` | csv / repeated | `oversized` · `regular` · `relaxed` · `slim` · `boxy` |
| `collections` | csv / repeated | curated collection slugs; several intersect |
| `tag` | csv / repeated | |
| `minPrice` / `maxPrice` | number | whole rupees |
| `inStock` | `true` | only items with stock |
| `onSale` | `true` | only discounted items |
| `search` | string | weighted text search |
| `sort` | enum | `featured` · `newest` · `best-selling` · `price-asc` · `price-desc` · `discount-desc` |

Example:

```
GET /api/products?category=t-shirts&gender=men&size=L&color=jet-black
    &minPrice=500&maxPrice=2500&sort=newest&page=1&limit=24
```

Response:

```json
{
  "success": true,
  "message": "Products fetched successfully",
  "data": {
    "products": [ /* card projection — no description, no variants */ ],
    "pagination": {
      "currentPage": 1,
      "limit": 24,
      "totalProducts": 18,
      "totalPages": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

With no `sort` and an active `search`, results are ordered by text relevance;
an explicit `sort` always wins.

### `GET /api/products/:slug`

→ `{ product, related }` — the full document plus up to 8 related items.
→ `404` if the product is inactive or missing.

### `GET /api/products/search?q=hoodie&limit=8`

Lightweight suggestions for the search overlay. Debounce on the client.

### `GET /api/products/home-feed`

→ `{ newDrops, bestsellers, featured }` — one indexed query per rail.

### `GET /api/products/facets?category=t-shirts`

Filter values derived from what is actually live, with counts:

```json
{ "price": { "min": 999, "max": 1599 }, "sizes": [], "colors": [], "fits": [], "genders": [] }
```

### `GET /api/products/by-ids?ids=<id>,<id>`

Resolves an ordered id list, preserving order. Powers "recently viewed".

### Admin 🔒 `admin`

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/products` | Create. Slug auto-generated and de-duplicated; SKUs derived per variant. |
| `PUT` | `/api/products/:id` | Partial update — only the keys you send change. |
| `DELETE` | `/api/products/:id` | Soft delete (deactivate). `?hard=true` also destroys Cloudinary assets. |
| `POST` | `/api/products/images` | `multipart/form-data`, field `images`, ≤8 files, ≤5MB each, JPEG/PNG/WebP/AVIF. Returns `{ url, publicId, width, height }` per file. |

Soft delete is the default because orders reference products — hard-deleting
one would leave order history pointing at nothing.

---

## Categories

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/categories?type=&nav=true` | Flat list |
| `GET` | `/api/categories/navigation` | Grouped: `gender`, `productTypes`, `collections`, `styles`, `all` |
| `GET` | `/api/categories/:slug` | Virtual collections resolve to a synthetic record so `/sale` still renders |
| `POST` `PUT` `DELETE` | `/api/categories[/:id]` | 🔒 `admin`. Delete is refused with `409` while products still reference it. |

---

## Cart 🔒

Guests keep their bag in `localStorage` and POST it to `/merge` once at
sign-in. Every read re-validates lines against the live catalogue and returns
`notices` describing anything that changed, rather than silently altering the
bag.

| Method | Path | Body |
| --- | --- | --- |
| `GET` | `/api/cart` | |
| `POST` | `/api/cart/items` | `{ productId, variantId, quantity }` — max 10 per line |
| `PUT` | `/api/cart/items/:itemId` | `{ quantity }` |
| `DELETE` | `/api/cart/items/:itemId` | |
| `DELETE` | `/api/cart` | Clear |
| `POST` | `/api/cart/merge` | `{ items: [{ productId, variantId, quantity }] }`, max 50 |

```json
{
  "cart": {
    "items": [{ "id": "…", "name": "…", "size": "L", "quantity": 1, "price": 1299, "lineTotal": 1299, "maxQuantity": 10 }],
    "totalQuantity": 1,
    "summary": { "subtotal": 1299, "discount": 0, "shippingFee": 0, "total": 1299, "currency": "INR", "freeShippingThreshold": 999 },
    "savings": 500,
    "notices": []
  }
}
```

→ `409` when a variant is sold out or the requested quantity exceeds stock.

Merge is forgiving: a line that fails validation is skipped and reported in
`notices`, so a shopper never loses their whole bag at the login step.

---

## Wishlist 🔒

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/wishlist` | Populated products |
| `GET` | `/api/wishlist/ids` | Ids only — cheap heart states for a grid |
| `POST` | `/api/wishlist/:productId` | Idempotent (`$addToSet`) |
| `DELETE` | `/api/wishlist/:productId` | |
| `DELETE` | `/api/wishlist` | Clear |
| `POST` | `/api/wishlist/:productId/move-to-cart` | `{ variantId, quantity }` — adds first, removes only on success |

---

## Orders

### `GET /api/orders/payment-methods`

Public. Which methods this environment actually supports:

```json
{ "methods": [
  { "method": "COD", "label": "Cash on Delivery", "enabled": true },
  { "method": "ONLINE", "label": "PhonePe — UPI, cards, net banking", "enabled": true, "provider": "phonepe", "testMode": true }
]}
```

`enabled: false` when PhonePe is not configured on this server.
`testMode: true` means the PhonePe **sandbox** — no real money moves.

### `POST /api/orders` 🔒

```json
{
  "addressId": "<saved address id>",
  "paymentMethod": "COD",
  "customerNote": "Leave with the guard"
}
```

Or send a one-off address instead of `addressId`:

```json
{
  "shippingAddress": { "name": "…", "phone": "9876543210", "addressLine1": "…", "city": "…", "state": "…", "postalCode": "560025", "country": "India" },
  "paymentMethod": "COD",
  "saveAddress": true
}
```

Builds from the signed-in user's cart. In order: reconcile the cart, resolve
the address, reserve stock line by line, create the payment intent, write the
order, empty the bag.

→ `201` `{ order, payment }` where `payment` is one of:

```json
{ "status": "cod" }
{ "status": "redirect", "redirectUrl": "https://mercury-uat.phonepe.com/…", "attemptNumber": 1, "expireAt": "…" }
{ "status": "unavailable", "message": "PhonePe is not responding right now. Your order is saved — please try the payment again in a moment." }
```

For `redirect`, send the browser to `redirectUrl` (always `https://…phonepe.com`).
PhonePe returns the shopper to `/payment/status?order=<id>`. Prices, totals
and discounts are never read from the request.
→ `400` if the bag is empty
→ `409` if the bag changed since checkout opened (the customer re-confirms
rather than being charged a different total), or if a line sold out mid-flight
— every reservation already taken is released first.

COD orders are created `CONFIRMED`; online orders start `PENDING` and become
`CONFIRMED` only when PhonePe's status API confirms the payment. Two
simultaneous checkouts for one bag → one `201`, one `409`.

### `GET /api/orders/:id/payment-status` 🔒

The verified payment state. If an attempt is still open the server asks
PhonePe first (at most every 4 s). Read-only — nothing the browser sends can
change it.

```json
{ "payment": {
  "orderId": "…", "orderNumber": "HV-…", "state": "PAID",
  "paymentStatus": "PAID", "orderStatus": "CONFIRMED", "paymentMethod": "ONLINE",
  "amount": 2499, "currency": "INR", "paidAt": "…", "expiresAt": "…", "canRetry": false,
  "attempt": { "attemptNumber": 1, "status": "PAID", "expireAt": "…", "paymentMode": "UPI_INTENT" }
} }
```

`state` is `PAID`, `PENDING`, `FAILED`, `CANCELLED` (not paid in time) or `COD`.

### `POST /api/orders/:id/payment/retry` 🔒

For an unpaid online order. Returns the still-valid checkout link if there is
one, otherwise opens a new attempt (`-P2`, `-P3`…; earlier attempts are kept).
`{ payment: { status: "redirect", redirectUrl, … } }` or `{ status: "paid" }`.
`409` once the payment window has closed or the order is no longer pending.

### `POST /api/payments/phonepe/webhook`

Called by PhonePe, not the storefront. Authenticated by
`Authorization: SHA256(username:password)`; see [PAYMENTS.md](PAYMENTS.md).
`401` bad signature · `400` malformed or wrong amount · `404` unknown
reference · `200` accepted (then re-verified with PhonePe's status API).

### `GET /api/orders?page=&limit=&status=` 🔒

→ `{ orders, pagination }`, newest first.

### `GET /api/orders/:id` 🔒

Scoped to the owner — another user's order returns `404`, not `403`, so ids
cannot be probed. Admins may read any order.

### `POST /api/orders/:id/cancel` 🔒

```json
{ "reason": "Changed my mind" }
```

Allowed from `PENDING`, `CONFIRMED` or `PROCESSING`, and not for an order
already paid online (the customer contacts support). Releases stock.
→ `409` once the parcel is with the courier.

### `PATCH /api/orders/:id/status` 🔒 `admin`

```json
{ "status": "SHIPPED", "note": "Handed to courier" }
```

Statuses: `PENDING` → `CONFIRMED` → `PROCESSING` → `SHIPPED` →
`OUT_FOR_DELIVERY` → `DELIVERED`, plus `CANCELLED`.
Marking a COD order `DELIVERED` also marks it paid.

---

## Users 🔒

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/users/me` | Profile with addresses |
| `PUT` | `/api/users/me` | `{ name, phone }` — email and role are not self-service |
| `GET` | `/api/users/me/addresses` | |
| `POST` | `/api/users/me/addresses` | Max 10; the first becomes the default |
| `PUT` | `/api/users/me/addresses/:id` | |
| `DELETE` | `/api/users/me/addresses/:id` | Promotes another address to default if needed |

---

## Storefront content

Admin-managed, public, no authentication. Only published content is returned,
so a draft or expired section is invisible to customers.

### `GET /api/homepage`

```json
{
  "success": true,
  "data": {
    "sections": [
      {
        "id": "…",
        "type": "hero",
        "key": "hero",
        "eyebrow": "The first drop",
        "title": "Built for your",
        "highlight": "movement",
        "description": "Printed. Heavyweight. Made to move.",
        "image": { "url": "…", "alt": "HUMOVARE campaign" },
        "primaryCta": { "label": "Shop new drops", "url": "/new-drops" },
        "items": [],
        "background": "canvas",
        "sortOrder": 0
      }
    ]
  }
}
```

The `community` section carries the Instagram wall: its `items` are post
permalinks (`{ id, url, caption }`), and the storefront hands each `url` to
Instagram's embed script. Nothing is uploaded — Instagram supplies the media.

`type` is one of `hero`, `categories`, `collections`, `productRail`, `brandStory`,
`styleRail`, `quality`, `community`, `trust` — a closed list, every member of
which has a renderer in `shop/src/pages/Home/HomePage.tsx`. Sections come
back in `sortOrder`.

Two types are hydrated server-side:

| Type | Extra fields |
| --- | --- |
| `productRail` | `products[]` (card projection) and `source` — a manual pick preserves the admin's order, otherwise the flag query (`newDrops`, `bestsellers`, `featured`, `sale`) runs |
| `categories` | `categories[]` — explicit picks in order, otherwise the nav product types |

### `GET /api/shop-config`

```json
{
  "success": true,
  "data": {
    "config": {
      "title": "Shop all",
      "description": "Every piece we make, in one place. …",
      "filters": [{ "key": "availability", "label": "Availability", "defaultOpen": true }],
      "sortOptions": [{ "value": "featured", "label": "Featured" }],
      "defaultSort": "featured",
      "pageSize": 24,
      "emptyTitle": "No products match those filters",
      "emptyDescription": "Try widening your price range or clearing a filter.",
      "seo": { "title": "", "description": "" }
    }
  }
}
```

Disabled filters and sort options are stripped, and both lists arrive already
ordered. `filters[].key` is restricted to what the sidebar implements
(`availability`, `size`, `colour`, `price`, `fit`, `fabric`) and
`sortOptions[].value` to what the products service understands, so the shop
page cannot be configured into a broken state. If the stored `defaultSort` has
been disabled, the first enabled option is returned instead.

### `GET /api/collections` · `GET /api/collections/:slug`

Published collections, and one collection with its products in the curated
order. The list feeds the home page grid, the `/collections/:slug` page and the
shop page's collection filter.

Products can also be narrowed to one or more collections through the normal
listing endpoint: `GET /api/products?collections=oversized-edit`. Several
collections intersect, and an unknown slug is a `404` rather than a silently
empty result.

---

## Feedback

### `POST /api/feedback`

`{ name, email, topic?, subject?, message }` — the contact form. Open to
signed-out visitors, rate limited, and the stored message is never echoed back
in the response. Signed-in senders have their account attached so support can
find their orders.

---

## Admin API 🛡

Everything under `/api/admin` — see
[ADMIN-ARCHITECTURE.md](ADMIN-ARCHITECTURE.md) for the permission catalogue and
the full route table.

### Authentication

Admins are a separate identity namespace with their own collection, their own
signing secrets (`ADMIN_JWT_*`) and a `typ: "admin"` claim. A customer access
token therefore fails an admin route twice over — wrong signature and wrong
type. Nothing about identity is read from `localStorage`, so editing client
state cannot grant access.

| Cookie | Flags | Purpose |
| --- | --- | --- |
| `hv_admin_at` | HTTP-only, `Secure`, `SameSite=Strict`, `Path=/api/admin` | Access token (15m) |
| `hv_admin_rt` | HTTP-only, `Secure`, `SameSite=Strict`, `Path=/api/admin` | Refresh token (7d) |
| `hv_admin_csrf` | readable, `Secure`, `SameSite=Strict`, `Path=/` | Double-submit value, echoed in `X-CSRF-Token` |

Both tokens are path-scoped to `/api/admin`, so they are never sent with a
storefront request. `SameSite=Strict` means the browser will not attach them to
a cross-site request at all; the double-submit check is the second layer behind
it. This assumes the admin app is served from the same site as the API — under
`/admin` on the storefront domain, or an `admin.` subdomain.

```
POST /api/admin/auth/login      { email, password }
POST /api/admin/auth/refresh    rotates; a reused token revokes the whole family
POST /api/admin/auth/logout
GET  /api/admin/auth/me
GET  /api/admin/auth/sessions
POST /api/admin/auth/change-password
```

Every other route requires, in order: a valid admin token, an active admin
account, a matching CSRF token on any mutation, the specific permission for
that route, and a Zod-validated body. Five failed sign-ins lock the account for
15 minutes; disabling an admin or changing their permissions bumps
`tokenVersion`, which invalidates their live tokens immediately.

### Route groups

| Group | Paths | Permission prefix |
| --- | --- | --- |
| Dashboard | `GET /dashboard` | `orders.read` |
| Products | `GET·POST /products`, `GET·PUT·DELETE /products/:id`, `POST /products/bulk` | `products.*` |
| Categories | `GET·POST /categories`, `PUT·DELETE /categories/:id` | `categories.*` |
| Collections | `GET·POST /collections`, `GET·PUT·DELETE /collections/:id` | `collections.*` |
| Homepage | `GET /homepage`, `GET /homepage/preview`, `POST /homepage/sections`, `PUT·DELETE /homepage/sections/:id`, `PUT /homepage/reorder` | `homepage.*` |
| Shop page | `GET·PUT /shop` | `shop.*` |
| Inventory | `GET /inventory`, `GET /inventory/:id/history`, `PUT /inventory`, `PUT /inventory/bulk` | `inventory.*` |
| Orders | `GET /orders`, `GET /orders/:id`, `PUT /orders/:id/status`, `POST /orders/:id/notes`, `GET /orders/:id/emails`, `POST /orders/:id/emails/:eventId/retry`, `GET /orders/:id/payments`, `POST /orders/:id/payments/verify` | `orders.*` |
| Customers | `GET /customers`, `GET /customers/:id`, `PUT /customers/:id/status` | `customers.*` |
| Feedback | `GET /feedback`, `PUT /feedback/:id`, `DELETE /feedback/:id` | `feedback.*` |
| Media | `GET /media`, `POST /media/signature`, `POST /media`, `PUT·DELETE /media/:id` | `media.*` |
| Admin users | `GET·POST /admin-users`, `GET·PUT /admin-users/:id`, `PUT /admin-users/:id/status`, `PUT /admin-users/:id/password`, `DELETE /admin-users/:id` | `admins.*` (delete also needs super admin) |
| Roles | `GET /roles`, `PUT /roles/:id` | `roles.manage` |
| Audit logs | `GET /audit-logs` | `auditlogs.read` **and** super admin |
| Settings | `GET·PUT /settings` | `settings.*` |

### Order emails

Status changes and checkout email the customer automatically — see
[EMAIL.md](EMAIL.md). The responses say what happened to the email:

```json
// POST /api/orders, /cancel
{ "order": { … }, "notifications": { "email": "sent" } }

// on failure — the order still succeeded
{ "order": { … }, "notifications": { "email": "failed",
  "message": "Your order was placed successfully. We couldn't send the confirmation email right now, but you can view your order from your account." } }
```

`email` is one of `sent`, `failed`, `queued` (still sending after 4 s — it
finishes in the background), `duplicate` (already sent), `skipped` or `none`.

`PUT /api/admin/orders/:id/status` also accepts courier details, which appear
in the shipped and out-for-delivery emails:

```json
{ "status": "SHIPPED", "note": "",
  "shipment": { "carrier": "Delhivery", "trackingNumber": "DLV1234567890",
                "trackingUrl": "https://www.delhivery.com/track/package/DLV1234567890",
                "estimatedDelivery": "2026-09-27" } }
```

`trackingUrl` must be an absolute `http(s)` link. The response carries
`email: { status }`.

`GET /api/admin/orders/:id/emails` — every email for the order: type, status,
recipient, subject, Resend message id, attempts, timing and failure category.
Bodies are never stored, so none are returned.

`POST /api/admin/orders/:id/emails/:eventId/retry` — sends a failed or skipped
email again. A sent email returns `duplicate` and is not resent.

### Media uploads

`POST /api/admin/media/signature` returns a short-lived Cloudinary signature
with the folder and transformation fixed server-side. The browser uploads
directly to Cloudinary, then registers the result with `POST /api/admin/media`,
which re-verifies Cloudinary's own signature before storing the asset — so a
client cannot claim a `public_id` it did not upload. `CLOUDINARY_API_SECRET`
stays on the server and is never sent to a browser.

Deleting an asset that a published product, category or section still
references is refused with `409` unless explicitly forced.

### Audit log

There is no update or delete route, and none of the services expose one —
nobody, including a super admin, can remove an entry on demand. Entries
redact any key that looks like a password or token, record before/after
state for changes, and are readable only by a super admin.

Entries do expire on their own: each is written with its deletion time
already set, `AUDIT_LOG_RETENTION_DAYS` days out (default 3), and MongoDB's
TTL mechanism removes it automatically once that passes — the same mechanism
`AdminSession` uses for expired sessions. `GET /audit-logs` reports the
current setting as `retentionDays` so the admin UI's wording always matches
the server. Changing the setting only affects entries written afterwards.

---

## Health

`GET /health` — outside `/api` and outside the rate limiter, for uptime probes.

```json
{ "success": true, "message": "HUMOVARE API is healthy", "data": { "status": "ok", "uptime": 42, "environment": "production" } }
```

---

🔒 = requires a valid customer access token.
🛡 = requires an admin session, a CSRF token on mutations, and the route's permission.
