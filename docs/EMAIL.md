# Transactional email

HUMOVARE sends its customer email through [Resend](https://resend.com), from
`HUMOVARE <noreply@humovare.in>` with replies going to `support@humovare.in`.
Every call to Resend happens on the server. The API key is read in one place
(`server/src/config/env.js`) and never reaches a response, a log line, the
audit log or the browser.

```
Browser ──▶ HUMOVARE API ──▶ Resend ──▶ Customer
                  │
                  └─▶ EmailEvent (one row per logical email)
```

---

## What is sent, and when

| Email | Subject | Trigger |
| --- | --- | --- |
| Welcome | `Welcome to HUMOVARE` | Account created (never on a failed registration) |
| Password reset | `Reset your HUMOVARE password` | `POST /api/auth/forgot-password` for a registered address |
| Order confirmation | `Order confirmed - HUMOVARE #<n>` | COD order placed · online payment verified · admin moves an order to CONFIRMED |
| Payment successful | `Payment successful - HUMOVARE Order #<n>` | Online payment verified **by the server** with PhonePe's status API |
| Payment unsuccessful | `Payment unsuccessful for HUMOVARE order #<n>` | Payment verification fails (once per order) |
| Processing | `Your HUMOVARE order #<n> is being processed` | Admin → PROCESSING |
| Shipped | `Your HUMOVARE order #<n> has shipped` | Admin → SHIPPED (with courier details if entered) |
| Out for delivery | `Your HUMOVARE order #<n> is out for delivery` | Admin → OUT_FOR_DELIVERY |
| Delivered | `Your HUMOVARE order #<n> has been delivered` | Admin → DELIVERED |
| Cancelled | `Your HUMOVARE order #<n> has been cancelled` | Customer cancels · admin → CANCELLED |

"View order" links go to the existing `/account/orders/<id>` page. The order
number is shown in every email body; the internal id appears only in that link,
which is behind sign-in.

---

## Code map

```
server/src/
├── models/EmailEvent.js                 one row per logical email
└── services/email/
    ├── transport.js                     resend · memory · preview · disabled
    ├── email.service.js                 sendEmail(): claim → render → send → record
    ├── notifications.js                 store events → emails, keys, retries
    └── templates/
        ├── components.js                EmailLayout, EmailHeader, EmailFooter,
        │                                PrimaryButton, StatusBadge, OrderItems,
        │                                OrderSummary, PaymentSummary,
        │                                ShippingInformation, TrackingInformation,
        │                                CustomerInformation, Notice …
        ├── orderParts.js                sign-off, order button
        ├── welcome.js
        ├── passwordReset.js
        ├── orderConfirmation.js
        ├── payment.js                   success + failed
        ├── orderStatus.js               processing … cancelled
        └── index.js                     type → template registry
```

**Templates are rendered locally**, not with Resend Templates, so no template
IDs are needed. React Email was considered and not used: the server is plain
ESM JavaScript with no JSX build step, and adding one for twelve emails would
cost more than the component functions here. The components are the same idea
— small, composable, reusable — expressed as functions that return table-based
HTML with inline styles, which is what Outlook's Word engine and Gmail's
stylesheet stripping both require.

Every value a customer or admin typed — names, address lines, product names,
couriers — passes through `esc()`. Every URL passes through `safeUrl()`, which
only allows absolute `http(s)`, so a tracking link can never become
`javascript:`. Each email also has a plain-text part.

To change the copy of an email, edit its file in `templates/`. To change
something every email shares — footer, button, colours — edit
`components.js`.

---

## Duplicate protection

Each email is keyed by **what it is about**, not by when it was attempted:

| Key | Sent at most |
| --- | --- |
| `welcome:<user>` | once per account |
| `password-reset:<user>:<token hash>` | once per reset token |
| `order:<order>:confirmation` | once per order |
| `order:<order>:payment-success` / `payment-failed` | once per order |
| `order:<order>:status:<STATUS>` | once per order per status |

Before sending, `sendEmail` claims the key's `EmailEvent` row in a single atomic
`findOneAndUpdate`. If the row is already `sent`, the claim fails on the unique
index and nothing goes out. That covers a retried request, an admin
double-click, a replayed payment callback, a background retry and two workers
racing — the test suite fires five simultaneous sends of one event and checks
exactly one arrives. The same key is passed to Resend as its idempotency key,
so Resend dedupes as well.

The service builds its own indexes before its first send, so this holds even
if a deployment never ran the seed.

---

## Failures and retries

An email can never undo the thing that triggered it. `sendEmail` does not
throw; an order that was placed stays placed.

1. **Inline:** up to three attempts, 0 · 0.5 · 1.5 s apart, but only for
   transient errors (rate limits, 5xx, network, timeouts). A permanent error —
   bad key, unverified sender, malformed address — stops at the first attempt.
2. **Deferred:** a transient failure is scheduled for the retry worker, which
   runs every 5 minutes (`EMAIL_RETRY_INTERVAL_MINUTES`) and backs off
   1 min → 5 min → 30 min → 2 h → 6 h. At most **5 attempts** in total.
3. **Superseded:** before a deferred retry, the worker checks whether the order
   has moved on. "Being processed" is not sent after "delivered"; a shipping
   email is not sent for a cancelled order. Those are marked `skipped`.
4. **Manual:** admins can retry any failed email from the order page.

Password reset emails are the exception: only the token's hash is stored, so
the email cannot be rebuilt later. They get inline retries only — a customer
who never receives one simply asks again.

When checkout's confirmation email fails, the customer sees:

> Your order was placed successfully. We couldn't send the confirmation email
> right now, but you can view your order from your account.

Nothing from Resend is ever shown to a customer.

### What is logged

Every attempt logs the email type, idempotency key, order id, user id, a
**masked** recipient (`a***@example.com`), the Resend message id, success or
failure, and an error category (`configuration`, `invalid_request`,
`rate_limited`, `quota`, `provider_error`, `network`, `render`). Never logged:
bodies, reset tokens, passwords, API keys. Provider error text is scrubbed of
anything key-shaped before it is stored.

---

## Password reset security

- 32 random bytes from `crypto.randomBytes`; only the **SHA-256 hash** is
  stored.
- Expires in **30 minutes**.
- **Single use**, enforced atomically: the token is claimed and cleared in one
  `findOneAndUpdate`, so two requests racing with the same link cannot both
  succeed.
- A successful reset **invalidates every session** on the account.
- `POST /api/auth/forgot-password` returns the same body for registered and
  unregistered addresses, and sends the email **off the request path**, so
  neither the response nor its timing reveals which addresses have accounts.
- **Rate limited twice:** 5 requests per hour per IP (the route limiter), and
  per account — at most one reset email a minute and five an hour, however
  many machines are asking.

Earlier builds returned the reset link in the development API response and
logged it to the console. Both are gone.

---

## Admin

On each order's page in the admin:

- **Update status** — emails the customer automatically. Choosing Shipped or
  Out for delivery reveals courier, tracking number, tracking link and
  estimated delivery; whatever is left blank is simply left out of the email.
  For Cancelled, the note becomes the reason shown to the customer.
- **Customer emails** — every email for the order: type, status, time,
  recipient, Resend message id, attempts, and a plain-language failure reason
  with a *Retry now* button.

The toast after a status change says whether the customer was emailed.

---

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | production | Server only. Use a **sending access** key restricted to `humovare.in`. |
| `RESEND_FROM_EMAIL` | | Default `noreply@humovare.in`. Must be on the verified domain. |
| `RESEND_FROM_NAME` | | Default `HUMOVARE`. |
| `RESEND_REPLY_TO` | | Default `support@humovare.in`. |
| `SUPPORT_EMAIL` | | Shown in footers. Defaults to `RESEND_REPLY_TO`. |
| `FRONTEND_URL` | production | Base for every link. **`https://humovare.in`** in production. |
| `EMAIL_LOGO_URL` | | Absolute https URL. Defaults to `${FRONTEND_URL}/humovare-logo.png`. |
| `EMAIL_TRANSPORT` | | `resend` · `preview` · `memory` · `disabled`. Leave blank. |
| `EMAIL_DEV_ALLOWLIST` | | Development only — see below. Default `*@resend.dev`. |
| `EMAIL_RETRY_WORKER` | | `true` by default. |
| `EMAIL_RETRY_INTERVAL_MINUTES` | | `5` by default. |

The logo is hosted on Cloudinary at
`humovare/email/humovare-logo` (360 px PNG, 8.6 KB) so it loads in any inbox,
including from a local test run. Outlook desktop does not render WebP or SVG,
which is why it is PNG.

### Local development

Outside production, Resend only delivers to addresses on
`EMAIL_DEV_ALLOWLIST` (exact addresses or `*@domain`, comma-separated).
Everything else is written to `server/.email-previews/` as an HTML file you can
open — including reset links. That folder is gitignored.

This exists because the seed creates customers on domains HUMOVARE does not
own. Without it, placing a test order as `demo@humovare.com` would email a
stranger. To receive real mail locally, add yourself:

```bash
EMAIL_DEV_ALLOWLIST=*@resend.dev,you@example.com
```

`EMAIL_DEV_ALLOWLIST=*` turns the safety net off so every customer gets real
mail locally, exactly as in production. This project's `server/.env` is set that
way — so do not place orders as the seeded demo accounts while it is.

With no key at all, development uses the preview folder for everything, and
production records every email as skipped (and warns at boot).

---

## Testing

### Automated

```bash
npm run test:email --workspace server
```

141 assertions against an in-memory database with the `memory` transport —
nothing touches the network. Covers registration, forgot / reset / used /
invalid / expired tokens, per-account throttling, IP rate limiting, COD and
online checkout, forged and replayed payment confirmations, every admin status,
missing tracking details, cancellation of unpaid and paid orders, provider outages, permanent rejections, the retry worker, superseded
emails, the admin history and retry endpoints, concurrent sends, and that no
token, password or key was ever logged.

`npm test --workspace server` runs it alongside the storefront and admin
suites. Both of those pin `EMAIL_TRANSPORT=memory`, so a live key in
`server/.env` can never make a test send mail.

### Against Resend

```bash
npm run email:check --workspace server
```

Sends all twelve templates to `delivered@resend.dev` — Resend's test inbox,
which records delivery without reaching a person — then reads back what Resend
recorded for each: delivery status, From and Reply-To. It also checks the key's
scope and that a repeated idempotency key returns the original message. Nothing
is written to the database.

To see the emails in a real Gmail or Outlook inbox:

```bash
npm run email:check --workspace server -- --to you@example.com
```

### Password reset, by hand

1. Add your address to `EMAIL_DEV_ALLOWLIST`, restart the API.
2. Register at `/register` with that address — the welcome email arrives.
3. Sign out, open `/forgot-password`, enter the address.
4. Open the email, click **Reset password**, choose a new password.
5. Click the same link again — it is refused as used.
6. Sign in with the new password.

### Order emails, by hand

1. Place a COD order — the confirmation arrives.
2. In the admin, open the order and move it through Processing → Shipped
   (fill in a courier and tracking number) → Out for delivery → Delivered.
   One email per step; the **Customer emails** panel lists each with its
   Resend id.
3. Try moving it to a status it is already in — refused, no email.

### In production

1. Set the variables above on the API host, with `FRONTEND_URL=https://humovare.in`.
2. Check the boot log: `Email transport: resend · from HUMOVARE <noreply@humovare.in>`.
   A warning here means the key is missing or `FRONTEND_URL` is not https.
3. Run the forgot-password flow against your own account.
4. In the Resend dashboard (**Emails**), confirm the message shows **Delivered**,
   From `HUMOVARE <noreply@humovare.in>`, Reply-To `support@humovare.in`.
5. Open the email in Gmail on a phone and on desktop; check the logo loads and
   the button links to `https://humovare.in/…`.

---

## Receiving replies at support@humovare.in

`humovare.in` is verified in Resend for **sending**, but has no MX records, so
it cannot **receive** mail. Until it can, `RESEND_REPLY_TO` and `SUPPORT_EMAIL`
point at `humovare.in@gmail.com`, so customer replies land in that Gmail
instead of bouncing.

To show customers `support@humovare.in` and still read everything in Gmail,
forward that address (free, about 10 minutes):

1. Sign up at **improvmx.com**, add the domain `humovare.in`, and create the
   alias `support` → `humovare.in@gmail.com`.
2. In **Hostinger** → Domains → humovare.in → **DNS / Nameservers**, add:

   | Type | Name | Value | Priority |
   | --- | --- | --- | --- |
   | MX | `@` | `mx1.improvmx.com` | 10 |
   | MX | `@` | `mx2.improvmx.com` | 20 |
   | TXT | `@` | `v=spf1 include:spf.improvmx.com ~all` | |

   Leave the existing `send` records alone — those are Resend's.
3. Wait until ImprovMX shows the domain as active, then send a test email to
   `support@humovare.in` from another account and check it reaches Gmail.
4. In `server/.env` (and on the production host) set
   `RESEND_REPLY_TO=support@humovare.in` and `SUPPORT_EMAIL=support@humovare.in`,
   then restart the API.

To also **reply** from Gmail as `support@humovare.in`: Gmail → Settings →
Accounts → *Send mail as* → add `support@humovare.in`, SMTP server
`smtp.resend.com`, port `465`, SSL, username `resend`, password a Resend
**sending-access** API key. Use a separate key for this, not the server's.

## Customer email addresses

New customer addresses must be `@gmail.com` — registration, the delivery
contact at checkout, the contact form and the newsletter. The server enforces
it (`CUSTOMER_EMAIL_DOMAINS` in `server/src/constants/index.js`); the storefront
mirrors it in `shop/src/utils/customerEmail.ts` so forms say so before
submitting. Change both lists together to allow more domains.

Sign-in and password reset are **not** restricted, so existing accounts on
other domains keep access to their orders. Admin accounts are unaffected.

---

## Database

No migration is needed. `EmailEvent` is a new collection, created on first
send with its indexes. The `Order` model gained an optional `shipment` sub-document,
which defaults to empty on existing orders.
