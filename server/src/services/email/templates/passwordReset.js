import { env } from '../../../config/env.js';
import {
  EmailLayout, Heading, Paragraph, PrimaryButton, FallbackLink, Notice, textEmail,
} from './components.js';

/**
 * Password reset.
 *
 * Carries the one-time link and nothing else about the account — no current
 * password (the server never has it), no order history, no address. If this
 * email is forwarded or read over a shoulder, the worst case is a link that
 * expires in minutes.
 */
export function passwordResetEmail({ firstName, resetUrl, expiresInMinutes }) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const expiry = `This link expires in ${expiresInMinutes} minutes and can only be used once.`;
  const ignore = 'If you did not ask to reset your password, you can ignore this email — your password will not change.';

  const html = EmailLayout({
    title: 'Reset your HUMOVARE password',
    preheader: `Use this link within ${expiresInMinutes} minutes to choose a new password.`,
    body: [
      Heading('Reset your password'),
      Paragraph(greeting),
      Paragraph('We received a request to reset the password for your HUMOVARE account. Choose a new one using the button below.'),
      PrimaryButton({ href: resetUrl, label: 'Reset password' }),
      Paragraph(expiry, { muted: true, size: 13 }),
      FallbackLink(resetUrl),
      Notice(ignore, 'info'),
      Paragraph(`Questions? Reply to this email or write to ${env.email.supportEmail}.`, { muted: true, size: 13 }),
    ].join(''),
  });

  const text = textEmail([
    'Reset your HUMOVARE password',
    '',
    greeting,
    '',
    'We received a request to reset the password for your HUMOVARE account.',
    '',
    `Reset your password: ${resetUrl}`,
    '',
    expiry,
    '',
    ignore,
  ]);

  return { subject: 'Reset your HUMOVARE password', html, text };
}

export default passwordResetEmail;
