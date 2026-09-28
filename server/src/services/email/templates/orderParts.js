import { env } from '../../../config/env.js';
import { Paragraph, PrimaryButton, RichParagraph, esc } from './components.js';

/**
 * Pieces every order email shares, so a change to the sign-off or the order
 * button happens once.
 */

export const greeting = (firstName) => (firstName ? `Hi ${firstName},` : 'Hi,');

export function viewOrderButton(vm, label = 'View order') {
  return PrimaryButton({ href: vm.orderUrl, label });
}

export function supportLine() {
  const email = env.email.supportEmail;
  return RichParagraph(
    `Questions about this order? Reply to this email or write to <a href="mailto:${esc(email)}" style="color:#C8161D;">${esc(email)}</a> and quote your order number.`,
    { muted: true, size: 13 },
  );
}

export const supportText = () =>
  `Questions? Reply to this email or write to ${env.email.supportEmail} and quote your order number.`;


export const intro = (text) => Paragraph(text);
