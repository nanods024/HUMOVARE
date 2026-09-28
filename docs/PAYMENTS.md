# Online payment — PhonePe

HUMOVARE takes online payment through **PhonePe Standard Checkout (API v2)**.
Cash on Delivery keeps working whether or not PhonePe is configured.

- Sandbox: `https://api-preprod.phonepe.com/apis/pg-sandbox`
- Production: `https://api.phonepe.com/apis/pg` (token: `https://api.phonepe.com/apis/identity-manager/v1/oauth/token`)

Endpoints and behaviour follow PhonePe's current developer documentation
(developer.phonepe.com → Payment Gateway → Website Integration → Standard
Checkout → API reference): Authorization, Create Payment, Order Status,
Webhook Handling.

Refunds are not offered by the shop.

---

## The one rule

**Nothing the browser or a webhook *says* changes money.** An order becomes
`PAID` only after the server asks PhonePe's **Order Status API** itself and
PhonePe answers `COMPLETED` with the exact amount the server asked for.

```
Browser ──▶ HUMOVARE API ──▶ PhonePe (token, create payment)
   ▲             │                    │
   │   redirectUrl (phonepe.com)      ▼
   └──────────── customer pays on PhonePe's page
                                      │
   PhonePe webhook ─▶ API ─▶ PhonePe status API ─▶ database ─▶ Resend
   Return page    ─▶ API ─▶ PhonePe status API ─┘
   Reconciler     ─▶ API ─▶ PhonePe status API ─┘
```

The client secret, access tokens and webhook password exist only on the API
server. The storefront receives exactly one thing from the gateway: PhonePe's
hosted checkout link (checked to be `https://…phonepe.com`, on the server and
again in the browser).

---

## Setup

### 1. Credentials (server only)

PhonePe Business Dashboard → switch to **Test mode** → **Developer Settings**:
copy the **Client ID**, **Client Secret** and **Client Version**.

`server/.env` (never the storefront, never a `VITE_` variable, never Git):

```bash
PHONEPE_ENV=sandbox
PHONEPE_CLIENT_ID=<test client id>
PHONEPE_CLIENT_SECRET=<test client secret>
PHONEPE_CLIENT_VERSION=1
PHONEPE_WEBHOOK_USERNAME=<choose one>
PHONEPE_WEBHOOK_PASSWORD=<choose a long random one>
```

`PHONEPE_ENV` has **no default** and must be `sandbox` or `production`.
Nothing switches environments by itself. Production needs its own
credentials from the dashboard's Live mode.

Restart the API. The boot log says:

```
Online payment: PhonePe (sandbox)
```

### 2. Check the real sandbox

```bash
npm run payments:check --workspace server
```

This talks to the **real PhonePe sandbox** with your credentials — a real
token, a real ₹1 test payment — and prints PhonePe's checkout link. Add
`-- --wait` to poll while you pay in the browser. It never prints the secret
or the token.

### 3. Webhook

PhonePe Business Dashboard (Test mode) → **Developer Settings → Webhooks →
Create**:

| Field | Value |
|---|---|
| URL | `https://<your API host>/api/payments/phonepe/webhook` |
| Username / Password | the same values as `PHONEPE_WEBHOOK_USERNAME` / `PASSWORD` |
| Events | `checkout.order.completed`, `checkout.order.failed` |

PhonePe cannot reach `localhost`. In local development, payments are still
confirmed — the return page and the reconciler ask PhonePe's status API. To
receive real webhooks locally, expose port 5000 with a tunnel (e.g.
`cloudflared tunnel --url http://localhost:5000`) and use that https URL.

---

## How a payment works

1. **Checkout** — `POST /api/orders` with `paymentMethod: "ONLINE"`. The
   server reconciles the bag against the database (prices, stock, active
   products), reserves stock, and creates the order `PENDING` / `PENDING`.
   The request body carries no prices; any sent are ignored.
2. **Attempt** — the server creates a `PaymentAttempt` with reference
   `<orderNumber>-P1` and the amount in paise from the **server's** total,
   gets a token (cached until shortly before `expires_at`), and calls
   `POST /checkout/v2/pay` with `expireAfter` (default 900 s) and
   `redirectUrl = <FRONTEND_URL>/payment/status?order=<id>`.
3. **Redirect** — the browser shows *Redirecting to PhonePe…* and goes to
   PhonePe's page. The Pay button is disabled; a second click is ignored in
   the browser and refused by the server (a checkout lock on the bag, and a
   unique index allowing one open attempt per order).
4. **Result** — whichever arrives first:
   - PhonePe's **webhook** (authenticated, then verified via the status API),
   - the **return page** asking `GET /api/orders/:id/payment-status` (the
     server checks PhonePe if the attempt is still open, at most every 4 s),
   - the **reconciler** (every 2 minutes).
5. **Paid** — one atomic update moves the attempt to `PAID`, then one atomic
   update moves the order to `paymentStatus: PAID`, `orderStatus: CONFIRMED`.
   Only the caller whose update matched sends **"Payment successful - HUMOVARE
   Order #…"** and the order confirmation, each exactly once.

### Order status vs payment status

They are separate fields. `orderStatus` is where the parcel is (`PENDING` →
`CONFIRMED` → … → `DELIVERED`); `paymentStatus` is the money:

| paymentStatus | Meaning |
|---|---|
| `PENDING` | Waiting for PhonePe |
| `PAID` | PhonePe confirmed it (or COD collected on delivery) |
| `FAILED` | The latest attempt failed; the order can be retried |
| `CANCELLED` | The order was cancelled before payment — nothing charged |

(A few orders from before refunds were removed may still show `REFUNDED`;
nothing in the shop sets it any more.)

Attempts have their own states: `CREATED`, `PENDING`, `PAID`, `FAILED`,
`EXPIRED`, `CANCELLED`.

### Failure and retry

A failed or cancelled payment leaves the order open with its stock held. The
page says *Payment was not completed* with **Retry payment**, which creates
attempt `-P2` (the failed one is kept). If the previous checkout link is still
valid and still `PENDING` at PhonePe, retry returns that same link instead of
opening a second payment.

### Abandoned checkouts

Each unpaid online order holds its stock for `PAYMENT_WINDOW_MINUTES`
(default 30). The reconciler only gives up once **every** attempt is final at
PhonePe — time passing alone never fails a payment. Then it cancels the order
(`CANCELLED` / `CANCELLED`) and releases the stock.

If money still arrives for an order that was already closed, it is never
lost: the order is marked `PAID` with **Needs review**, the customer gets a
receipt, and the admin decides what to do with the order.

---

## Webhook security

`POST /api/payments/phonepe/webhook` needs no customer session. Instead:

1. `Authorization` must equal SHA256(`username:password`) in hex — compared in
   constant time. Missing or wrong → `401`.
2. The body must have an `event` and a `payload.state` → else `400`.
3. `payload.merchantOrderId` must be one of ours →
   else `404`.
4. `payload.amount`, if present, must equal what we asked for → else `400`.
5. Then `200` within milliseconds, and the payment is **re-read from PhonePe's
   status API** in the background.

PhonePe's header is the same on every call, so a captured webhook could be
replayed. That is harmless here: the webhook's own `state` is never used, and
every transition is one-way and idempotent. Duplicate and simultaneous
webhooks produce one state change and one email (the test suite fires eight
at once).

---

## Admin portal

Every online order shows a **Payment** panel: gateway, status, amount PhonePe
confirmed, our reference, PhonePe's order and transaction ids, mode, times,
every attempt with its outcome and error code, and the payment log. **Check
with PhonePe** asks PhonePe's status API for anything still open.

Unpaid online orders cannot be moved to *Confirmed* by hand.

---

## Data

| Collection | Holds |
|---|---|
| `paymentattempts` | One per trip to PhonePe: reference, paise amount, state, PhonePe ids, error codes |
| `paymentevents` | Append-only audit: created, pending, success, failed, expired, webhook received/rejected |
| `orders.payment` | Summary: provider, reference, transaction, amount paid, attempts, paid at, stock-held-until, needs-review |

No secret, token, raw webhook body or card detail is stored anywhere.

---

## Testing

| Command | What it does |
|---|---|
| `npm run payments:check --workspace server` | **Real PhonePe sandbox**: token, a real ₹1 payment, status |
| `npm run test:payments --workspace server` | 128 automated checks of the whole flow |

The automated suite cannot complete a checkout on PhonePe's website, and needs
to produce situations the sandbox cannot on demand (duplicate and
simultaneous webhooks, timeouts, 5xx, expired tokens, a wrong amount, a
database failure mid-update). So it runs the **real client and real API**
against a *test double* of PhonePe's documented HTTP API
(`server/scripts/lib/phonepe-test-double.mjs`). That double lives only in the
test scripts; the seam that plugs it in refuses to run in production. The
application has no fake or mock payment path.

What it covers: success, failure, customer cancel, abandoned checkout,
timeout/expiry, duplicate callback, two "Place order" clicks, two "Pay"
clicks, refreshing success and failure pages, invalid and foreign order ids,
unknown payment reference, amount mismatch (webhook and status API),
tampered price/total/discount, negative/zero/fractional/huge quantity,
unknown product, retry with a new attempt, bad/missing webhook signature,
malformed payload, refund endpoints and webhooks being absent, Resend outage,
PhonePe timeout on create and on status, temporary 503, expired access token,
a database failure between the attempt and the order update (repaired by the
reconciler), eight simultaneous callbacks, and that no secret or token ever
appears in a log line or an API response.

### Manual sandbox test

1. Fill in the PhonePe variables, restart the API, run `payments:check`.
2. On the storefront, add an item, check out, choose **Pay with PhonePe**.
3. On PhonePe's sandbox page, complete the payment with the test instruments
   PhonePe lists for the sandbox. Try a failure and a cancel too.
4. You land on `/payment/status`: *Verifying your payment…* → *Payment
   successful* (or *Payment was not completed* with **Retry payment**).
5. Admin → Orders → the order → **Payment** panel shows the attempt(s).

---

## Going to production

- [ ] Live-mode credentials from the PhonePe dashboard — **not** the sandbox ones
- [ ] `PHONEPE_ENV=production` on the **API host only**
- [ ] `FRONTEND_URL=https://humovare.in` (online payment is refused in production without https)
- [ ] Production webhook created on the dashboard (Live mode) pointing at `https://<api host>/api/payments/phonepe/webhook`, with new username/password
- [ ] Boot log shows `Online payment: PhonePe (production)` with no warnings
- [ ] One real low-value payment, end to end
- [ ] Never run `payments:check` against production (it refuses to)
