/**
 * Live check against Resend: sends every template once, then asks Resend
 * what it recorded.
 *
 *   npm run email:check --workspace server
 *   npm run email:check --workspace server -- --to you@example.com
 *
 * Defaults to `delivered@resend.dev`, Resend's test inbox: it accepts mail and
 * records it as delivered without it reaching a person, so this can be run
 * safely at any time. Pass `--to` with your own address to see the emails in a
 * real Gmail or Outlook inbox.
 *
 * It uses the real key from server/.env and the real templates, but none of
 * the database — nothing is written, and no customer is emailed.
 */
import 'dotenv/config';
import { Resend } from 'resend';

import { env } from '../src/config/env.js';
import { renderTemplate } from '../src/services/email/templates/index.js';
import { orderViewModel } from '../src/services/email/notifications.js';
import { EMAIL_TYPES } from '../src/models/EmailEvent.js';

const args = process.argv.slice(2);
const toFlag = args.indexOf('--to');
const to = toFlag >= 0 ? args[toFlag + 1] : 'delivered@resend.dev';

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log('\n── Configuration ──');
line('API key', env.email.resendApiKey ? `set (${env.email.resendApiKey.slice(0, 3)}…, ${env.email.resendApiKey.length} chars)` : 'MISSING');
line('From', env.email.from);
line('Reply-To', env.email.replyTo);
line('Links point to', env.frontendUrl);
line('Logo', env.email.logoUrl || `${env.frontendUrl}/humovare-logo.png`);
line('Sending to', to);

if (!env.email.resendApiKey) {
  console.error('\nRESEND_API_KEY is not set in server/.env.');
  process.exit(1);
}

const resend = new Resend(env.email.resendApiKey);

// ── Key scope ───────────────────────────────────────────────────────────────
// A sending-access key cannot list domains. That refusal is the good outcome:
// it means a leaked key can send mail but cannot read or change the account.
console.log('\n── API key scope ──');
const domains = await resend.domains.list();
if (domains.error?.name === 'restricted_api_key') {
  line('Scope', 'sending access only ✓ (cannot read or manage the account)');
} else if (domains.error) {
  line('Scope', `could not check (${domains.error.name})`);
} else {
  line('Scope', 'FULL ACCESS — consider a sending-only key restricted to humovare.in');
  for (const domain of domains.data?.data ?? []) line(`Domain ${domain.name}`, domain.status);
}

// ── Sample data ─────────────────────────────────────────────────────────────
const now = new Date();
const sampleOrder = {
  _id: '66f0c0ffee0000000000abcd',
  orderNumber: 'HV-LIVECHECK',
  createdAt: now,
  orderStatus: 'CONFIRMED',
  paymentMethod: 'ONLINE',
  paymentStatus: 'PAID',
  payment: { reference: 'pay_LIVECHECK001', paidAt: now },
  items: [
    { name: 'HUMOVARE Movement Print Tee', color: 'Jet Black', size: 'L', quantity: 2, price: 1449, lineTotal: 2898, image: 'https://picsum.photos/seed/humovare-movement-print-tee-1/400/500' },
    { name: 'HUMOVARE Signature Hoodie', color: 'Oxblood', size: 'M', quantity: 1, price: 2499, lineTotal: 2499, image: 'https://picsum.photos/seed/humovare-signature-hoodie-1/400/500' },
  ],
  subtotal: 5397,
  discount: 300,
  shippingFee: 0,
  total: 5097,
  shippingAddress: {
    name: 'Aarav Mehta', phone: '9876543210', addressLine1: 'Door No. 43-18-41, P Savitri Enclave',
    addressLine2: 'TSN Colony, Dondaparthy', city: 'Visakhapatnam', state: 'Andhra Pradesh', postalCode: '530016', country: 'India',
  },
  shipment: {
    carrier: 'Delhivery', trackingNumber: 'DLV1234567890',
    trackingUrl: 'https://www.delhivery.com/track/package/DLV1234567890',
    estimatedDelivery: new Date(now.getTime() + 3 * 86400000),
  },
  statusHistory: [{ status: 'CANCELLED', note: 'Ordered the wrong size' }],
  deliveredAt: now,
};
const vm = orderViewModel(sampleOrder, { name: 'Aarav Mehta', email: to });

const SAMPLES = [
  [EMAIL_TYPES.WELCOME, { firstName: 'Aarav' }],
  [EMAIL_TYPES.PASSWORD_RESET, { firstName: 'Aarav', resetUrl: `${env.frontendUrl}/reset-password?token=${'0'.repeat(64)}`, expiresInMinutes: 30 }],
  [EMAIL_TYPES.ORDER_CONFIRMATION, vm],
  [EMAIL_TYPES.PAYMENT_SUCCESS, vm],
  [EMAIL_TYPES.PAYMENT_FAILED, vm],
  [EMAIL_TYPES.ORDER_PROCESSING, vm],
  [EMAIL_TYPES.ORDER_SHIPPED, vm],
  [EMAIL_TYPES.ORDER_OUT_FOR_DELIVERY, vm],
  [EMAIL_TYPES.ORDER_DELIVERED, vm],
  [EMAIL_TYPES.ORDER_CANCELLED, vm],
];

// ── Send ────────────────────────────────────────────────────────────────────
console.log('\n── Sending ──');
const runId = Date.now().toString(36);
const results = [];

for (const [type, model] of SAMPLES) {
  const { subject, html, text } = renderTemplate(type, model);
  const { data, error } = await resend.emails.send(
    {
      from: env.email.from,
      to: [to],
      replyTo: env.email.replyTo,
      subject: `[Live check] ${subject}`,
      html,
      text,
      tags: [{ name: 'type', value: type.toLowerCase() }, { name: 'source', value: 'live-check' }],
    },
    { idempotencyKey: `live-check:${runId}:${type}` },
  );

  results.push({ type, subject, id: data?.id, error });
  line(type, error ? `✗ ${error.name}: ${error.message}` : `✓ accepted ${data.id}`);

  // Resend's default limit is a few requests per second.
  await new Promise((resolve) => setTimeout(resolve, 600));
}

// ── Idempotency ─────────────────────────────────────────────────────────────
// Resending with the same key must return the same message, not a second one.
console.log('\n── Idempotency ──');
const first = results.find((result) => result.id);
if (first) {
  const again = renderTemplate(first.type, SAMPLES.find(([type]) => type === first.type)[1]);
  const repeat = await resend.emails.send(
    { from: env.email.from, to: [to], replyTo: env.email.replyTo, subject: `[Live check] ${again.subject}`, html: again.html, text: again.text,
      tags: [{ name: 'type', value: first.type.toLowerCase() }, { name: 'source', value: 'live-check' }] },
    { idempotencyKey: `live-check:${runId}:${first.type}` },
  );
  line('Same key, same email', repeat.data?.id === first.id ? `✓ Resend returned the original (${first.id})` : `returned ${repeat.data?.id ?? repeat.error?.name}`);
}

// ── What Resend recorded ────────────────────────────────────────────────────
console.log('\n── What Resend recorded ──');
await new Promise((resolve) => setTimeout(resolve, 4000));

let verified = 0;
for (const result of results.filter((entry) => entry.id)) {
  const { data, error } = await resend.emails.get(result.id);
  if (error) {
    line(result.type, `accepted; details unavailable with this key (${error.name})`);
    continue;
  }

  const replyTo = Array.isArray(data.reply_to) ? data.reply_to.join(', ') : data.reply_to;
  const okFrom = data.from === env.email.from;
  const okReply = replyTo === env.email.replyTo;
  if (okFrom && okReply) verified += 1;

  line(result.type, `${data.last_event ?? 'queued'} · from ${okFrom ? '✓' : `✗ ${data.from}`} · reply-to ${okReply ? '✓' : `✗ ${replyTo}`}`);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

const accepted = results.filter((entry) => entry.id).length;
console.log(`\n${'='.repeat(56)}`);
console.log(`Accepted by Resend: ${accepted}/${results.length}${verified ? `   From/Reply-To confirmed: ${verified}/${accepted}` : ''}`);
console.log('='.repeat(56));
process.exit(accepted === results.length ? 0 : 1);
