import {
  EmailLayout, Heading, Paragraph, OrderMeta, OrderItems, OrderSummary, ShippingInformation,
  TrackingInformation, PrimaryButton, DetailRows, Card, safeUrl, formatMoney,
  textEmail, textItems, textTotals, textAddress,
} from './components.js';
import { greeting, viewOrderButton, supportLine, supportText } from './orderParts.js';

/**
 * One template per order milestone. Each is short on purpose: the customer
 * already has the full order in the confirmation email and on the order page,
 * so a status email says what changed and links back.
 */

// ── Processing ───────────────────────────────────────────────────────────────

export function orderProcessingEmail(vm) {
  const subject = `Your HUMOVARE order #${vm.orderNumber} is being processed`;

  const html = EmailLayout({
    title: subject,
    preheader: 'We are picking and packing your order now.',
    body: [
      Heading('Your order is being prepared'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`We are picking and packing order #${vm.orderNumber}. We will email you again with tracking details as soon as it ships.`),
      OrderMeta({ orderNumber: vm.orderNumber, orderDate: vm.orderDate, statusLabel: 'Processing', statusTone: 'info' }),
      OrderItems(vm.items),
      viewOrderButton(vm),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Your order is being prepared',
    '',
    greeting(vm.firstName),
    '',
    `We are picking and packing order #${vm.orderNumber}. We will email you again with tracking details as soon as it ships.`,
    '',
    textItems(vm.items),
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

// ── Shipped ──────────────────────────────────────────────────────────────────

export function orderShippedEmail(vm) {
  const subject = `Your HUMOVARE order #${vm.orderNumber} has shipped`;
  const trackingUrl = safeUrl(vm.shipment?.trackingUrl);

  const html = EmailLayout({
    title: subject,
    preheader: vm.shipment?.trackingNumber
      ? `Tracking number ${vm.shipment.trackingNumber}.`
      : 'Your order is on its way.',
    body: [
      Heading('Your order is on its way'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`Order #${vm.orderNumber} has left our studio and is with the courier.`),
      // Tracking gets the button when there is a link; otherwise the order page does.
      trackingUrl ? PrimaryButton({ href: trackingUrl, label: 'Track order' }) : viewOrderButton(vm),
      TrackingInformation(vm.shipment),
      OrderItems(vm.items),
      ShippingInformation(vm.shippingAddress),
      trackingUrl ? viewOrderButton(vm) : '',
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Your order is on its way',
    '',
    greeting(vm.firstName),
    '',
    `Order #${vm.orderNumber} has left our studio and is with the courier.`,
    vm.shipment?.carrier ? `Courier: ${vm.shipment.carrier}` : null,
    vm.shipment?.trackingNumber ? `Tracking number: ${vm.shipment.trackingNumber}` : null,
    trackingUrl ? `Track your order: ${trackingUrl}` : null,
    vm.shipment?.estimatedDelivery ? `Estimated delivery: ${vm.shipment.estimatedDelivery}` : null,
    '',
    textItems(vm.items),
    '',
    'Shipping to:',
    textAddress(vm.shippingAddress),
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

// ── Out for delivery ─────────────────────────────────────────────────────────

export function orderOutForDeliveryEmail(vm) {
  const subject = `Your HUMOVARE order #${vm.orderNumber} is out for delivery`;
  const trackingUrl = safeUrl(vm.shipment?.trackingUrl);

  const html = EmailLayout({
    title: subject,
    preheader: 'Your parcel should arrive today.',
    body: [
      Heading('Arriving today'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`Order #${vm.orderNumber} is out for delivery and should reach you today. Keep your phone handy in case the courier calls.`),
      trackingUrl ? PrimaryButton({ href: trackingUrl, label: 'Track order' }) : viewOrderButton(vm),
      TrackingInformation(vm.shipment),
      ShippingInformation(vm.shippingAddress, { title: 'Delivering to' }),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Arriving today',
    '',
    greeting(vm.firstName),
    '',
    `Order #${vm.orderNumber} is out for delivery and should reach you today.`,
    vm.shipment?.trackingNumber ? `Tracking number: ${vm.shipment.trackingNumber}` : null,
    trackingUrl ? `Track your order: ${trackingUrl}` : null,
    '',
    'Delivering to:',
    textAddress(vm.shippingAddress),
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

// ── Delivered ────────────────────────────────────────────────────────────────

export function orderDeliveredEmail(vm) {
  const subject = `Your HUMOVARE order #${vm.orderNumber} has been delivered`;

  const html = EmailLayout({
    title: subject,
    preheader: 'Your order has arrived. We hope it fits the way it should.',
    body: [
      Heading('Delivered'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`Order #${vm.orderNumber} was delivered${vm.deliveredAt ? ` on ${vm.deliveredAt}` : ''}. We hope it wears the way it should.`),
      Card('Delivery', DetailRows([
        ['Order number', `#${vm.orderNumber}`, { bold: true }],
        ['Delivered', vm.deliveredAt],
        ['Total', formatMoney(vm.totals.total)],
      ])),
      OrderItems(vm.items),
      Paragraph('Something not right? Unworn pieces with tags intact can be returned within 7 days of delivery from your order page.', { muted: true, size: 13 }),
      viewOrderButton(vm),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Delivered',
    '',
    greeting(vm.firstName),
    '',
    `Order #${vm.orderNumber} was delivered${vm.deliveredAt ? ` on ${vm.deliveredAt}` : ''}.`,
    `Total: ${formatMoney(vm.totals.total)}`,
    '',
    textItems(vm.items),
    '',
    'Unworn pieces with tags intact can be returned within 7 days of delivery.',
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

// ── Cancelled ────────────────────────────────────────────────────────────────

export function orderCancelledEmail(vm) {
  const subject = `Your HUMOVARE order #${vm.orderNumber} has been cancelled`;

  const html = EmailLayout({
    title: subject,
    preheader: `Order #${vm.orderNumber} has been cancelled.`,
    body: [
      Heading('Your order has been cancelled'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`Order #${vm.orderNumber} has been cancelled.`),
      vm.cancellation?.reason ? Card('Reason', Paragraph(vm.cancellation.reason, { size: 14 })) : '',
      OrderItems(vm.items, { title: 'Cancelled items' }),
      OrderSummary(vm.totals),
      viewOrderButton(vm),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Your order has been cancelled',
    '',
    greeting(vm.firstName),
    '',
    `Order #${vm.orderNumber} has been cancelled.`,
    vm.cancellation?.reason ? `Reason: ${vm.cancellation.reason}` : null,
    '',
    'Cancelled items:',
    textItems(vm.items),
    '',
    textTotals(vm.totals),
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

export default {
  orderProcessingEmail,
  orderShippedEmail,
  orderOutForDeliveryEmail,
  orderDeliveredEmail,
  orderCancelledEmail,
};
