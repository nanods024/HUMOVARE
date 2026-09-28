# HUMOVARE Admin Portal — architecture

Written **after** inspecting the existing customer frontend. The storefront is
the source of truth; the admin portal and its data model are shaped around what
the customer app already renders, not the other way round.

---

## 1. Current frontend structure

```
shop/src/
├── pages/Home/HomePage.tsx        the section running order
├── pages/Shop/ShopPage.tsx        title + copy, delegates to ProductListing
├── pages/Shop/CollectionPage.tsx  one component serves /t-shirts, /sale, …
├── components/home/               Hero, CategoryGrid, StyleRail, BrandStory,
│                                  QualitySection, Community, TrustSection,
│                                  Newsletter, SectionHeader
├── components/shop/               ProductListing, FilterSidebar, Pagination,
│                                  ActiveFilterChips
└── components/product/            ProductCard, ProductGrid/Rail, gallery…
```

Navigation is a single **Shop** mega menu (`components/layout/ShopMenu.tsx`)
driven by `GET /api/categories/navigation`.

---

## 2. Home page — dynamic-content mapping

Sections in render order, with what is already dynamic and what must become so.

| # | Section | Today | Becomes admin-managed |
| --- | --- | --- | --- |
| 1 | `Hero` | **Hardcoded** copy; image from `VITE_HERO_IMAGE` | eyebrow, heading, highlight word, subcopy, desktop + mobile image, 2× CTA (label + URL + variant), overlay strength |
| 2 | `Categories` | Live — `/api/categories?nav=true`, filtered to `type: 'product-type'` | section heading, link label/URL, **which** categories and their order |
| 3 | `New Drops` | Live — `/api/products/home-feed` (`isNewDrop`) | eyebrow/title/description/link, plus optional **manual product pick** overriding the flag query |
| 4 | `Bestsellers` | Live — home-feed (`isBestSeller`) | same as above |
| 5 | `BrandStory` | **Hardcoded** copy + picsum image | eyebrow, heading, highlight, 3 paragraphs, image, CTA |
| 6 | `StyleRail` | **Hardcoded** `STYLE_TILES` constant | tiles: title, copy, target URL, image, order |
| 7 | `QualitySection` | **Hardcoded** `PILLARS` array + image | heading/description, 5 pillars (icon, title, copy), feature image |
| 8 | `Community` | **Hardcoded** 6 picsum tiles | heading/description, tile images + links, Instagram CTA |
| 9 | `TrustSection` | **Hardcoded** `ITEMS` array | 5 items (icon, title, copy) |
| 10 | `Newsletter` | Hardcoded copy (rendered inside `Footer`) | heading, copy, CTA label |

**Design constraint:** every one of these components keeps its current markup,
classes and responsive behaviour. Only the *data source* changes — props in,
instead of module-level constants. No section is redesigned.

### Section model

Rather than one rigid document, the home page is an **ordered list of typed
sections** so the admin can reorder, disable and schedule them:

```
HomepageSection {
  type      'hero' | 'categories' | 'collections' | 'productRail'
          | 'brandStory' | 'styleRail' | 'quality' | 'community' | 'trust'
  key       stable slug, e.g. 'new-drops-rail'
  content   type-specific structured object (never raw HTML)
  products  [ObjectId]   manual override for productRail
  categories[ObjectId]   explicit picks for the categories grid
  sortOrder, status, startAt, endAt
}
```

The type list is closed, and every member of it has a renderer in the
storefront home page — a type the customer cannot display is not a type the
admin is allowed to create. The admin smoke test asserts this.

`status` is `draft | published | scheduled | archived`. The customer endpoint
only ever returns sections that are published **and** inside their date window.

---

## 3. Shop page — dynamic-content mapping

| Feature | Today | Becomes admin-managed |
| --- | --- | --- |
| Page title / description | Hardcoded in `ShopPage.tsx` | `ShopConfig.title`, `.description`, SEO fields |
| Filters | `FilterSidebar` renders Availability, Size, Colour, Price, Fit, Fabric — values come from `/api/products/facets` | per-filter **enabled**, **label**, **order**, **defaultOpen** |
| Sorting | `SORT_OPTIONS` constant (6 options) | per-option **enabled**, **label**, **order**, plus the **default** |
| Page size | `PRODUCTS_PER_PAGE = 24` | `ShopConfig.pageSize` |
| Empty state | Hardcoded copy | `ShopConfig.emptyTitle`, `.emptyDescription` |
| Collection pages | `COLLECTION_ROUTES` constant | derived from `Category` documents (`showInNav`, `displayOrder`) |

Filters are **declared by the frontend and curated by the admin** — the admin
can hide or rename a filter the UI supports, but cannot invent one it does not.
That keeps the config incapable of breaking the page.

Filtering, sorting and pagination stay **server-side** (`/api/products`), which
is already the case.

---

## 4. Data model

New collections alongside the existing `User · Product · Category · Cart ·
Wishlist · Order · Address`:

| Model | Purpose |
| --- | --- |
| `AdminUser` | Separate identity store. Never shares a token namespace with customers. |
| `AdminSession` | One row per refresh token — enables revocation and login history. |
| `Role` | Named permission bundles; seeded, editable by SUPER_ADMIN. |
| `AuditLog` | Append-only record of every admin mutation. |
| `HomepageSection` | The ordered, typed, schedulable home page. |
| `ShopConfig` | Singleton: shop title, filters, sorting, page size, SEO. |
| `Collection` | Curated product groupings with explicit ordering. |
| `MediaAsset` | Cloudinary metadata + usage tracking. |
| `InventoryTransaction` | Append-only stock ledger (who, why, delta). |
| `StoreSetting` | Singleton: store identity, shipping, returns, SEO defaults. |

Indexes follow real query shapes — `AuditLog { adminId, createdAt }` and
`{ resource, createdAt }`; `AdminSession { adminUser, revokedAt }`;
`HomepageSection { status, sortOrder }`.

---

## 5. Admin module architecture

```
admin/src/
├── api/          admin axios instance (cookie auth + CSRF header)
├── components/   ui/ · layout/ · table/ · form/ · media/
├── hooks/        useAdminAuth, usePermission, useDataTable
├── layouts/      AdminLayout (sidebar + topbar), AuthLayout
├── pages/        dashboard, catalog, storefront, orders, customers,
│                 administration, settings
├── permissions/  PERMISSIONS catalogue + <Can> guard
├── routes/       route map with per-route permission requirements
└── store/        auth + UI (sidebar collapse)
```

Deployed at `/admin` (Vite `base: '/admin/'`), a **separate bundle** from the
storefront so admin code never ships to customers.

---

## 6. API contract

Customer (new): `GET /api/homepage`, `GET /api/shop-config`,
`GET /api/collections`, `GET /api/collections/:slug`.

Admin: everything under `/api/admin/*` — auth, dashboard, products,
categories, collections, inventory, orders, customers, homepage, shop, media,
admin-users, roles, audit-logs, settings. Full table in
[`API.md`](./API.md#admin-api).

---

## 7. Security architecture

Defence in depth. Frontend guards are **UX only**; every admin request is
independently authorised on the server.

```
request → rate limit → CSRF (mutations) → admin JWT (separate secret)
        → AdminUser loaded, isActive checked, tokenVersion matched
        → session not revoked
        → requirePermission('products.delete')
        → Zod validation
        → service executes
        → audit log written
```

Specifics:

- **Separate token namespace.** Admin access tokens are signed with
  `ADMIN_JWT_ACCESS_SECRET` and carry `typ: 'admin'`. A customer token
  presented to an admin route fails signature *and* type checks — promoting a
  customer to admin is impossible by editing client state.
- **HTTP-only cookies.** Both admin tokens are cookies scoped to `/api/admin`;
  neither is readable from JavaScript, so XSS cannot exfiltrate a session.
- **CSRF.** Because auth rides on cookies, every mutating admin request must
  echo a double-submit token (`X-CSRF-Token` vs a non-HttpOnly cookie).
- **Refresh rotation + revocation.** Each refresh issues a new token and
  retires the old one; a reused token revokes the whole session family.
- **Lockout.** 5 failed logins locks an account for 15 minutes.
- **Cloudinary.** The secret never leaves the server. Uploads are signed
  server-side; the browser gets a short-lived signature, not credentials.
- **Order totals** are recalculated server-side from the database — the client
  cannot influence price, discount or shipping.
- **Audit logs** are append-only; no route deletes or edits them.

---

## 8. Delivery order

1. Backend foundation — models, admin auth, RBAC, audit logging ✔
2. Admin CRUD APIs + customer CMS endpoints ✔
3. Admin frontend ✔
4. Customer frontend wiring (data source only, no redesign) ✔
5. Tests, hardening, docs
