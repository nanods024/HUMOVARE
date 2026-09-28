import { env } from '../../../config/env.js';

/**
 * Email building blocks.
 *
 * Emails are not web pages. Outlook on Windows renders with Word's engine, so
 * there is no flexbox, no grid, no external stylesheet and patchy <style>
 * support; Gmail strips <style> in some contexts too. Every component here is
 * therefore a nested table with inline styles, which is the one layout model
 * every client agrees on.
 *
 * Each component returns an HTML string. Anything that came from a user — a
 * name, an address line, a product name, a courier — goes through `esc()`
 * before it reaches the markup, and every URL through `safeUrl()`.
 */

// ── Tokens ───────────────────────────────────────────────────────────────────

export const COLORS = {
  page: '#F6F4F3',
  card: '#FFFFFF',
  ink: '#1A1718',
  muted: '#6B6365',
  subtle: '#9A9294',
  line: '#E7E2E0',
  primary: '#C8161D',
  primaryInk: '#FFFFFF',
  success: '#1F7A4D',
  successBg: '#E8F4EE',
  warning: '#9A5B00',
  warningBg: '#FBF0DE',
  danger: '#B3261E',
  dangerBg: '#FBE9E7',
  info: '#1D4E89',
  infoBg: '#E6EEF8',
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// ── Safety ───────────────────────────────────────────────────────────────────

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escapes a value for use in text or an attribute. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * Only absolute http(s) URLs are allowed into an href or src. A courier's
 * tracking link is typed in by an admin; `javascript:` or `data:` there would
 * be an injection vector in someone's inbox.
 */
export function safeUrl(value) {
  const url = String(value ?? '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : '';
}

// ── Formatting ───────────────────────────────────────────────────────────────

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const formatMoney = (amount) => money.format(Number(amount) || 0);

/** Dates are shown in India time, which is where the shop and its customers are. */
export function formatDate(value, { withTime = false } = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * The document shell: a 600px column centred on a tinted page.
 *
 * The preheader is the grey line most clients show after the subject in the
 * inbox list. It is hidden in the body itself, and padded with zero-width
 * characters so the client does not fill the rest of the line with body copy.
 */
export function EmailLayout({ title, preheader = '', body }) {
  const pad = '&#847;&zwnj;&nbsp;'.repeat(60);

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table, td, h1, h2, p, a { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
<style>
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
  a { color: ${COLORS.primary}; }
  @media only screen and (max-width: 620px) {
    .hv-container { width: 100% !important; }
    .hv-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .hv-stack { display: block !important; width: 100% !important; }
    .hv-hide-mobile { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.page};">${esc(preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="hv-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        ${EmailHeader()}
        <tr>
          <td style="background-color:${COLORS.card};border:1px solid ${COLORS.line};border-radius:8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="hv-pad" style="padding:36px 40px;font-family:${FONT};color:${COLORS.ink};font-size:15px;line-height:24px;">
                  ${body}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${EmailFooter()}
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Logo, falling back to a text wordmark wherever images are blocked. */
export function EmailHeader() {
  const logo = safeUrl(env.email.logoUrl) || `${env.frontendUrl}/humovare-logo.png`;

  return `<tr>
  <td align="center" style="padding:0 0 24px 0;">
    <a href="${esc(env.frontendUrl)}" target="_blank" style="text-decoration:none;">
      <img src="${esc(logo)}" width="160" alt="HUMOVARE" style="display:block;width:160px;max-width:160px;height:auto;border:0;font-family:${FONT};font-size:22px;font-weight:800;letter-spacing:2px;color:${COLORS.primary};">
    </a>
  </td>
</tr>`;
}

export function EmailFooter() {
  const support = env.email.supportEmail;
  const site = env.frontendUrl.replace(/^https?:\/\//, '');

  return `<tr>
  <td align="center" style="padding:28px 24px 8px 24px;font-family:${FONT};font-size:12px;line-height:19px;color:${COLORS.subtle};">
    <p style="margin:0 0 6px 0;font-weight:700;letter-spacing:2px;color:${COLORS.muted};">HUMOVARE</p>
    <p style="margin:0 0 6px 0;"><a href="${esc(env.frontendUrl)}" target="_blank" style="color:${COLORS.muted};text-decoration:none;">${esc(site)}</a></p>
    <p style="margin:0 0 14px 0;">Support: <a href="mailto:${esc(support)}" style="color:${COLORS.muted};text-decoration:underline;">${esc(support)}</a></p>
    <p style="margin:0;color:${COLORS.subtle};">You are receiving this because of activity on your HUMOVARE account.</p>
  </td>
</tr>`;
}

// ── Typography ───────────────────────────────────────────────────────────────

export function Heading(text) {
  return `<h1 style="margin:0 0 16px 0;font-family:${FONT};font-size:24px;line-height:31px;font-weight:700;color:${COLORS.ink};">${esc(text)}</h1>`;
}

/** Paragraph from plain text. */
export function Paragraph(text, { muted = false, size = 15 } = {}) {
  return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${muted ? COLORS.muted : COLORS.ink};">${esc(text)}</p>`;
}

/**
 * Paragraph from trusted markup the template itself composed. Never pass a
 * user value here unless it has already been through `esc()`.
 */
export function RichParagraph(html, { muted = false, size = 15 } = {}) {
  return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${muted ? COLORS.muted : COLORS.ink};">${html}</p>`;
}

// ── Buttons & badges ─────────────────────────────────────────────────────────

/**
 * A "bulletproof" button: the VML branch gives Outlook a real rounded
 * rectangle, and everyone else gets a padded link inside a coloured cell.
 */
export function PrimaryButton({ href, label }) {
  const url = safeUrl(href);
  if (!url) return '';

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
  <tr>
    <td align="left">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(url)}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="10%" stroke="f" fillcolor="${COLORS.primary}">
        <w:anchorlock/>
        <center style="color:${COLORS.primaryInk};font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:1px;">${esc(label)}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${esc(url)}" target="_blank" style="display:inline-block;background-color:${COLORS.primary};color:${COLORS.primaryInk};font-family:${FONT};font-size:14px;font-weight:700;letter-spacing:1px;line-height:46px;text-align:center;text-decoration:none;text-transform:uppercase;padding:0 28px;border-radius:4px;mso-hide:all;">${esc(label)}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

/** The raw link under a button, for clients that strip buttons. */
export function FallbackLink(href) {
  const url = safeUrl(href);
  if (!url) return '';

  return `<p style="margin:0 0 20px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${COLORS.muted};word-break:break-all;">If the button does not work, copy this link into your browser:<br><a href="${esc(url)}" target="_blank" style="color:${COLORS.primary};">${esc(url)}</a></p>`;
}

const TONES = {
  success: [COLORS.success, COLORS.successBg],
  warning: [COLORS.warning, COLORS.warningBg],
  danger: [COLORS.danger, COLORS.dangerBg],
  info: [COLORS.info, COLORS.infoBg],
  neutral: [COLORS.muted, COLORS.page],
};

export function StatusBadge(label, tone = 'neutral') {
  const [fg, bg] = TONES[tone] ?? TONES.neutral;
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:${bg};color:${fg};font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">${esc(label)}</span>`;
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** A titled, bordered block. `inner` is markup this module produced. */
export function Card(title, inner) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;border:1px solid ${COLORS.line};border-radius:6px;">
  ${title ? `<tr><td style="padding:14px 18px;border-bottom:1px solid ${COLORS.line};font-family:${FONT};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${esc(title)}</td></tr>` : ''}
  <tr><td style="padding:16px 18px;font-family:${FONT};font-size:14px;line-height:22px;color:${COLORS.ink};">${inner}</td></tr>
</table>`;
}

/** Label / value rows. Rows whose value is empty are left out entirely. */
export function DetailRows(rows) {
  const present = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (present.length === 0) return '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${present
    .map(
      ([label, value, opts = {}]) => `<tr>
    <td style="padding:4px 0;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.muted};vertical-align:top;">${esc(label)}</td>
    <td align="right" style="padding:4px 0 4px 16px;font-family:${FONT};font-size:14px;line-height:21px;color:${COLORS.ink};font-weight:${opts.bold ? 700 : 400};vertical-align:top;">${opts.html ? value : esc(value)}</td>
  </tr>`,
    )
    .join('')}
</table>`;
}

// ── Order blocks ─────────────────────────────────────────────────────────────

/** The at-a-glance header card: number, date, status. */
export function OrderMeta({ orderNumber, orderDate, statusLabel, statusTone = 'neutral' }) {
  return Card(
    '',
    DetailRows([
      ['Order number', `#${orderNumber}`, { bold: true }],
      ['Order date', orderDate],
      ['Status', StatusBadge(statusLabel, statusTone), { html: true }],
    ]),
  );
}

/** Line items with thumbnails. Images are only shown when the URL is safe. */
export function OrderItems(items = [], { title = 'Items' } = {}) {
  if (items.length === 0) return '';

  const rows = items
    .map((item) => {
      const image = safeUrl(item.image);
      return `<tr>
  <td width="64" style="padding:10px 12px 10px 0;vertical-align:top;">
    ${
      image
        ? `<img src="${esc(image)}" width="56" height="70" alt="" style="display:block;width:56px;height:70px;object-fit:cover;border-radius:4px;background-color:${COLORS.page};">`
        : `<div style="width:56px;height:70px;border-radius:4px;background-color:${COLORS.page};"></div>`
    }
  </td>
  <td style="padding:10px 0;vertical-align:top;font-family:${FONT};">
    <p style="margin:0 0 3px 0;font-size:14px;line-height:20px;font-weight:600;color:${COLORS.ink};">${esc(item.name)}</p>
    ${item.variant ? `<p style="margin:0 0 3px 0;font-size:12px;line-height:18px;color:${COLORS.muted};">${esc(item.variant)}</p>` : ''}
    <p style="margin:0;font-size:12px;line-height:18px;color:${COLORS.muted};">Qty ${esc(item.quantity)} &times; ${esc(formatMoney(item.unitPrice))}</p>
  </td>
  <td align="right" style="padding:10px 0 10px 12px;vertical-align:top;font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${COLORS.ink};white-space:nowrap;">${esc(formatMoney(item.lineTotal))}</td>
</tr>`;
    })
    .join(`<tr><td colspan="3" style="border-top:1px solid ${COLORS.line};font-size:0;line-height:0;">&nbsp;</td></tr>`);

  return Card(title, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`);
}

/** Money breakdown. Zero discount and zero tax rows are dropped. */
export function OrderSummary(totals) {
  const rows = [
    ['Subtotal', formatMoney(totals.subtotal)],
    totals.discount > 0 ? ['Discount', `−${formatMoney(totals.discount)}`] : null,
    ['Shipping', totals.shippingFee > 0 ? formatMoney(totals.shippingFee) : 'Free'],
    totals.tax > 0 ? ['Tax', formatMoney(totals.tax)] : null,
  ].filter(Boolean);

  return Card(
    'Order summary',
    `${DetailRows(rows)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid ${COLORS.line};">
  <tr>
    <td style="padding:10px 0 0 0;font-family:${FONT};font-size:15px;line-height:22px;font-weight:700;color:${COLORS.ink};">Total</td>
    <td align="right" style="padding:10px 0 0 0;font-family:${FONT};font-size:17px;line-height:22px;font-weight:700;color:${COLORS.ink};">${esc(formatMoney(totals.total))}</td>
  </tr>
</table>`,
  );
}

export function PaymentSummary({ methodLabel, statusLabel, statusTone, reference, paidAt, amount }) {
  return Card(
    'Payment',
    DetailRows([
      ['Method', methodLabel],
      amount !== undefined ? ['Amount', formatMoney(amount), { bold: true }] : null,
      statusLabel ? ['Status', StatusBadge(statusLabel, statusTone), { html: true }] : null,
      ['Reference', reference],
      ['Date', paidAt],
    ].filter(Boolean)),
  );
}

export function ShippingInformation(address, { title = 'Shipping to' } = {}) {
  if (!address) return '';

  const lines = [
    address.name,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ].filter((line) => line && String(line).trim());

  return Card(
    title,
    `<p style="margin:0;font-family:${FONT};font-size:14px;line-height:22px;color:${COLORS.ink};">${lines.map(esc).join('<br>')}</p>`,
  );
}

/**
 * Courier details. Returns nothing at all when there is nothing to show, so a
 * shipped email never carries an empty "Tracking" box.
 */
export function TrackingInformation(shipment = {}) {
  const rows = [
    ['Courier', shipment.carrier],
    ['Tracking number', shipment.trackingNumber, { bold: true }],
    ['Estimated delivery', shipment.estimatedDelivery],
  ];

  const hasAny = rows.some(([, value]) => value && String(value).trim());
  if (!hasAny) return '';

  return Card('Tracking', DetailRows(rows));
}

/** A tinted notice box, used for security notes and other asides. */
export function Notice(text, tone = 'neutral') {
  const [fg, bg] = TONES[tone] ?? TONES.neutral;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;">
  <tr><td style="padding:14px 16px;border-radius:6px;background-color:${bg};font-family:${FONT};font-size:13px;line-height:20px;color:${fg};">${esc(text)}</td></tr>
</table>`;
}

// ── Plain text ───────────────────────────────────────────────────────────────

/**
 * The plain-text part. Some clients show only this, spam filters score an
 * HTML-only email worse, and screen readers in text mode read it directly.
 */
export function textEmail(sections) {
  const support = env.email.supportEmail;
  return [
    ...sections.filter((part) => part !== null && part !== undefined && part !== ''),
    '',
    '—',
    'HUMOVARE',
    env.frontendUrl.replace(/^https?:\/\//, ''),
    `Support: ${support}`,
  ].join('\n');
}

export function textItems(items = []) {
  return items
    .map((item) => `- ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity} — ${formatMoney(item.lineTotal)}`)
    .join('\n');
}

export function textTotals(totals) {
  return [
    `Subtotal: ${formatMoney(totals.subtotal)}`,
    totals.discount > 0 ? `Discount: −${formatMoney(totals.discount)}` : null,
    `Shipping: ${totals.shippingFee > 0 ? formatMoney(totals.shippingFee) : 'Free'}`,
    totals.tax > 0 ? `Tax: ${formatMoney(totals.tax)}` : null,
    `Total: ${formatMoney(totals.total)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function textAddress(address) {
  if (!address) return '';
  return [
    address.name,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ]
    .filter((line) => line && String(line).trim())
    .join('\n');
}
