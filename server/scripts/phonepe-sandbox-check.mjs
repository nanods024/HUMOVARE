/**
 * Live check against the REAL PhonePe sandbox — no test double, no database.
 *
 *   npm run payments:check --workspace server
 *   npm run payments:check --workspace server -- --wait            (then pay in the browser)
 *
 * Uses PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET from server/.env and the
 * same client the shop uses:
 *   1. gets a real OAuth token from PhonePe,
 *   2. creates a real ₹1 sandbox payment and prints PhonePe's checkout link,
 *   3. reads its status back from PhonePe's status API,
 *   4. (--wait) polls while you complete it in the browser.
 *
 * It refuses to run unless PHONEPE_ENV=sandbox. The secret and the access
 * token are never printed.
 */
import 'dotenv/config';
import { env } from '../src/config/env.js';
import * as phonepe from '../src/services/payments/phonepe.client.js';

const args = new Set(process.argv.slice(2));
const line = (label, value) => console.log(`  ${label.padEnd(20)} ${value}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

console.log('\n── Configuration ──');
line('PHONEPE_ENV', env.phonepe.env || 'NOT SET');
line('Client ID', env.phonepe.clientId ? `${env.phonepe.clientId.slice(0, 6)}… (${env.phonepe.clientId.length} chars)` : 'MISSING');
line('Client secret', env.phonepe.clientSecret ? `set (${env.phonepe.clientSecret.length} chars)` : 'MISSING');
line('Client version', env.phonepe.clientVersion);
line('Webhook credentials', env.phonepe.webhookConfigured ? 'set' : 'not set — webhooks will be refused');
line('Return URL base', env.frontendUrl);

if (env.phonepe.env !== 'sandbox') {
  console.error('\nThis check only runs against the sandbox. Set PHONEPE_ENV=sandbox in server/.env.');
  process.exit(1);
}
if (!env.phonepe.isConfigured) {
  console.error('\nSet PHONEPE_CLIENT_ID and PHONEPE_CLIENT_SECRET in server/.env (never in the storefront).');
  process.exit(1);
}

const reference = `HVCHECK-${Date.now().toString(36).toUpperCase()}`;
const amount = 100; // ₹1, in paise

try {
  console.log('\n── Create payment (real PhonePe sandbox) ──');
  const created = await phonepe.createPayment({
    merchantOrderId: reference,
    amount,
    expireAfter: 600,
    redirectUrl: `${env.frontendUrl}/payment/status?check=${reference}`,
    message: 'HUMOVARE sandbox check',
    udf: { udf1: 'sandbox-check' },
  });
  line('Token', 'obtained ✓ (not shown)');
  line('Reference', reference);
  line('PhonePe order id', created.gatewayOrderId);
  line('State', created.state);
  line('Link expires', created.expireAt?.toISOString() ?? '—');
  console.log(`\n  Open this PhonePe sandbox checkout in your browser:\n  ${created.redirectUrl}\n`);

  console.log('── Status (from PhonePe) ──');
  let status = await phonepe.getOrderStatus(reference);
  line('State', status.state);
  line('Amount', `${status.amount} paise`);

  if (args.has('--wait')) {
    console.log('\n  Waiting up to 10 minutes for you to complete or cancel the payment…');
    const deadline = Date.now() + 10 * 60 * 1000;
    while (status.state === 'PENDING' && Date.now() < deadline) {
      await sleep(5000);
      status = await phonepe.getOrderStatus(reference);
      process.stdout.write(`  … ${status.state}\r`);
    }
    console.log('');
    line('Final state', status.state);
    if (status.payment) line('Payment mode', `${status.payment.paymentMode} · txn ${status.payment.transactionId}`);
    if (status.state === 'FAILED') line('Error', [status.errorCode, status.detailedErrorCode].filter(Boolean).join(' / ') || '—');
  }

  console.log(`\n${'='.repeat(56)}\nPhonePe sandbox reachable with these credentials ✓\n${'='.repeat(56)}`);
  process.exit(0);
} catch (error) {
  console.error(`\n  PhonePe check failed: ${error.message}`);
  if (error.kind === 'auth') console.error('  → The client ID / secret / version were refused. Re-copy them from the PhonePe Business Dashboard (Test mode).');
  if (error.kind === 'timeout' || error.kind === 'network') console.error('  → Could not reach api-preprod.phonepe.com from this machine.');
  process.exit(1);
}
