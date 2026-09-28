/**
 * A TEST DOUBLE of PhonePe's Standard Checkout v2 API, for the
 * automated tests ONLY. It lives under scripts/ and is plugged in through
 * `setPhonePeFetch`, which refuses to run in production — the application
 * code has no fake payment path of its own.
 *
 * It implements the documented request/response shapes closely enough to
 * exercise the real client: form-encoded OAuth, `O-Bearer` tokens that
 * expire, paise amounts, PENDING/COMPLETED/FAILED states. Tests
 * drive it: complete or fail an order, inject timeouts, 5xx, 401s, or report
 * a wrong amount.
 */
import crypto from 'node:crypto';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function createPhonePeTestDouble({ clientId, clientSecret, clientVersion = '1' }) {
  const tokens = new Map(); // value → expiresAt ms
  const orders = new Map(); // merchantOrderId → order
  const faults = []; // { match, kind, status, count }
  const calls = { token: 0, pay: 0, status: 0 };
  const payRequests = [];

  function takeFault(op) {
    const fault = faults.find((entry) => entry.op === op && entry.count > 0);
    if (!fault) return null;
    fault.count -= 1;
    return fault;
  }

  function hang(signal) {
    // Never answers; resolves only by the client's own timeout aborting it.
    return new Promise((_, reject) => {
      signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  }

  async function applyFault(op, signal) {
    const fault = takeFault(op);
    if (!fault) return null;
    if (fault.kind === 'timeout') return hang(signal);
    if (fault.kind === 'network') throw new TypeError('fetch failed');
    return json(fault.status ?? 503, { code: fault.code ?? 'INTERNAL_SERVER_ERROR', message: 'Injected fault' });
  }

  function authorised(headers) {
    const header = headers?.Authorization ?? headers?.authorization ?? '';
    const match = /^O-Bearer (.+)$/.exec(header);
    if (!match) return false;
    const expiresAt = tokens.get(match[1]);
    return Boolean(expiresAt && expiresAt > Date.now());
  }

  function statusBody(order) {
    // An unpaid order that has passed its expiry is failed by PhonePe.
    if (order.state === 'PENDING' && order.expireAt < Date.now()) {
      order.state = 'FAILED';
      order.errorCode = 'TXN_EXPIRED';
    }
    const reported = order.reportAmount ?? order.amount;
    const details = order.state === 'PENDING' && !order.touched
      ? []
      : [{
        paymentMode: 'UPI_INTENT',
        transactionId: order.transactionId,
        timestamp: Date.now(),
        amount: reported,
        state: order.state,
        ...(order.state === 'FAILED' ? { errorCode: order.errorCode, detailedErrorCode: order.detailedErrorCode } : {}),
      }];
    return {
      orderId: order.orderId,
      state: order.state,
      amount: reported,
      expireAt: order.expireAt,
      metaInfo: order.metaInfo,
      paymentDetails: details,
      ...(order.state === 'FAILED' ? { errorCode: order.errorCode, detailedErrorCode: order.detailedErrorCode } : {}),
    };
  }

  async function fetch(url, init = {}) {
    const { pathname } = new URL(url);
    const method = (init.method ?? 'GET').toUpperCase();

    // ── OAuth ──
    if (method === 'POST' && pathname.endsWith('/v1/oauth/token')) {
      calls.token += 1;
      const faulted = await applyFault('token', init.signal);
      if (faulted) return faulted;
      const form = new URLSearchParams(init.body);
      if (
        init.headers?.['Content-Type'] !== 'application/x-www-form-urlencoded'
        || form.get('grant_type') !== 'client_credentials'
        || form.get('client_id') !== clientId
        || form.get('client_secret') !== clientSecret
        || form.get('client_version') !== clientVersion
      ) {
        return json(401, { code: 'INVALID_CLIENT', message: 'Bad client credentials' });
      }
      const value = `tok_${crypto.randomBytes(12).toString('hex')}`;
      const expiresAt = Date.now() + 3600 * 1000;
      tokens.set(value, expiresAt);
      return json(200, { access_token: value, issued_at: Math.floor(Date.now() / 1000), expires_at: Math.floor(expiresAt / 1000), token_type: 'O-Bearer' });
    }

    // ── Create payment ──
    if (method === 'POST' && pathname.endsWith('/checkout/v2/pay')) {
      calls.pay += 1;
      const faulted = await applyFault('pay', init.signal);
      if (faulted) return faulted;
      if (!authorised(init.headers)) return json(401, { code: 'UNAUTHORIZED' });
      const body = JSON.parse(init.body);
      payRequests.push(body);
      if (
        typeof body.merchantOrderId !== 'string' || body.merchantOrderId.length > 63 || !/^[\w-]+$/.test(body.merchantOrderId)
        || !Number.isInteger(body.amount) || body.amount < 100
        || body.paymentFlow?.type !== 'PG_CHECKOUT' || !body.paymentFlow?.merchantUrls?.redirectUrl
        || (body.expireAfter !== undefined && (body.expireAfter < 300 || body.expireAfter > 3600))
      ) {
        return json(400, { code: 'BAD_REQUEST', message: 'Invalid request' });
      }
      if (orders.has(body.merchantOrderId)) return json(400, { code: 'DUPLICATE_ORDER' });
      const order = {
        merchantOrderId: body.merchantOrderId,
        orderId: `OMO${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
        amount: body.amount,
        state: 'PENDING',
        expireAt: Date.now() + (body.expireAfter ?? 1200) * 1000,
        metaInfo: body.metaInfo,
        transactionId: `OM${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
        redirectUrl: body.paymentFlow.merchantUrls.redirectUrl,
      };
      orders.set(order.merchantOrderId, order);
      return json(200, {
        orderId: order.orderId,
        state: 'PENDING',
        expireAt: order.expireAt,
        redirectUrl: `https://mercury-uat.phonepe.com/transact/uat_v2?token=${crypto.randomBytes(16).toString('hex')}`,
      });
    }

    // ── Order status ──
    const match = /\/checkout\/v2\/order\/([^/]+)\/status$/.exec(pathname);
    if (method === 'GET' && match) {
      calls.status += 1;
      const faulted = await applyFault('status', init.signal);
      if (faulted) return faulted;
      if (!authorised(init.headers)) return json(401, { code: 'UNAUTHORIZED' });
      const order = orders.get(decodeURIComponent(match[1]));
      if (!order) return json(404, { code: 'ORDER_NOT_FOUND' });
      return json(200, statusBody(order));
    }

    return json(404, { code: 'NOT_FOUND' });
  }

  return {
    fetch,
    calls,
    payRequests,
    orders,
    /** The customer paid. */
    complete(merchantOrderId) {
      const order = orders.get(merchantOrderId);
      order.state = 'COMPLETED';
      order.touched = true;
    },
    /** The payment failed or the customer cancelled on PhonePe. */
    fail(merchantOrderId, errorCode = 'PAYMENT_ERROR', detailedErrorCode = 'ZM') {
      const order = orders.get(merchantOrderId);
      Object.assign(order, { state: 'FAILED', errorCode, detailedErrorCode, touched: true });
    },
    expireNow(merchantOrderId) {
      orders.get(merchantOrderId).expireAt = Date.now() - 1000;
    },
    reportAmount(merchantOrderId, amount) {
      orders.get(merchantOrderId).reportAmount = amount;
    },
    /** e.g. inject('status', { kind: 'timeout', count: 3 }) or inject('pay', { status: 503 }). */
    inject(op, { kind = 'http', status, code, count = 1 } = {}) {
      faults.push({ op, kind, status, code, count });
    },
    clearFaults() {
      faults.length = 0;
    },
    /** Every issued token stops working: the next call gets a 401. */
    revokeTokens() {
      tokens.clear();
    },
  };
}

/** What PhonePe sends in the webhook Authorization header. */
export const webhookAuthorization = (username, password) =>
  crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
