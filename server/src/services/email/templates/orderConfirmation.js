import {
  EmailLayout, Heading, Paragraph, OrderMeta, OrderItems, OrderSummary, PaymentSummary,
  ShippingInformation, textEmail, textItems, textTotals, textAddress,
} from './components.js';
import { greeting, viewOrderButton, supportLine, supportText } from './orderParts.js';

/** Sent once per order, the moment it is confirmed. */
export function orderConfirmationEmail(vm) {
  const subject = `Order confirmed - HUMOVARE #${vm.orderNumber}`;

  const html = EmailLayout({
    title: subject,
    preheader: `Thank you for your order. We will let you know as soon as it ships.`,
    body: [
      Heading('Thank you for your order'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(
        `Your order #${vm.orderNumber} is confirmed. We are getting it ready and will email you again as soon as it ships.`,
      ),
      viewOrderButton(vm),
      OrderMeta({ orderNumber: vm.orderNumber, orderDate: vm.orderDate, statusLabel: vm.statusLabel, statusTone: vm.statusTone }),
      OrderItems(vm.items),
      OrderSummary(vm.totals),
      PaymentSummary({
        methodLabel: vm.payment.methodLabel,
        statusLabel: vm.payment.statusLabel,
        statusTone: vm.payment.statusTone,
      }),
      ShippingInformation(vm.shippingAddress),
      vm.estimatedDelivery ? Paragraph(`Estimated delivery: ${vm.estimatedDelivery}`, { muted: true, size: 13 }) : '',
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Thank you for your order',
    '',
    greeting(vm.firstName),
    '',
    `Your order #${vm.orderNumber} is confirmed.`,
    `Order date: ${vm.orderDate}`,
    `Status: ${vm.statusLabel}`,
    '',
    textItems(vm.items),
    '',
    textTotals(vm.totals),
    '',
    `Payment: ${vm.payment.methodLabel}`,
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

export default orderConfirmationEmail;
