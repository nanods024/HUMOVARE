import {
  EmailLayout, Heading, Paragraph, PaymentSummary, Notice, textEmail, formatMoney,
} from './components.js';
import { greeting, viewOrderButton, supportLine, supportText } from './orderParts.js';

/**
 * Sent only after the server has verified the payment with the provider —
 * never on the strength of what the browser reported.
 */
export function paymentSuccessEmail(vm) {
  const subject = `Payment successful - HUMOVARE Order #${vm.orderNumber}`;

  const html = EmailLayout({
    title: subject,
    preheader: `We received ${formatMoney(vm.payment.amount)} for order #${vm.orderNumber}.`,
    body: [
      Heading('Payment received'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(`We have received your payment for order #${vm.orderNumber}. Thank you.`),
      PaymentSummary({
        methodLabel: vm.payment.methodLabel,
        amount: vm.payment.amount,
        statusLabel: 'Paid',
        statusTone: 'success',
        reference: vm.payment.reference,
        paidAt: vm.payment.paidAt,
      }),
      viewOrderButton(vm),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'Payment received',
    '',
    greeting(vm.firstName),
    '',
    `We have received your payment for order #${vm.orderNumber}.`,
    `Amount paid: ${formatMoney(vm.payment.amount)}`,
    `Method: ${vm.payment.methodLabel}`,
    vm.payment.reference ? `Reference: ${vm.payment.reference}` : null,
    vm.payment.paidAt ? `Date: ${vm.payment.paidAt}` : null,
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

/**
 * Sent once per order when payment verification fails. It invites a retry
 * rather than alarming the customer: most failures are a closed tab or a bank
 * decline, and nothing has been charged.
 */
export function paymentFailedEmail(vm) {
  const subject = `Payment unsuccessful for HUMOVARE order #${vm.orderNumber}`;
  const reassurance = 'No money has been taken for this order. If your bank shows a pending charge, it will be released automatically.';

  const html = EmailLayout({
    title: subject,
    preheader: `We could not confirm the payment for order #${vm.orderNumber}. Your items are still reserved for now.`,
    body: [
      Heading('We could not confirm your payment'),
      Paragraph(greeting(vm.firstName)),
      Paragraph(
        `The payment for order #${vm.orderNumber} did not go through. You can try again from your order page.`,
      ),
      Notice(reassurance, 'warning'),
      PaymentSummary({
        methodLabel: vm.payment.methodLabel,
        amount: vm.totals.total,
        statusLabel: 'Failed',
        statusTone: 'danger',
      }),
      viewOrderButton(vm, 'View order'),
      supportLine(),
    ].join(''),
  });

  const text = textEmail([
    'We could not confirm your payment',
    '',
    greeting(vm.firstName),
    '',
    `The payment for order #${vm.orderNumber} did not go through.`,
    reassurance,
    '',
    `View your order: ${vm.orderUrl}`,
    '',
    supportText(),
  ]);

  return { subject, html, text };
}

export default { paymentSuccessEmail, paymentFailedEmail };
