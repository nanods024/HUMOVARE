import { env } from '../../../config/env.js';
import {
  EmailLayout, Heading, Paragraph, PrimaryButton, FallbackLink, textEmail,
} from './components.js';

/** Sent once, after an account has actually been created. */
export function welcomeEmail({ firstName }) {
  const shopUrl = `${env.frontendUrl}/shop`;
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

  const html = EmailLayout({
    title: 'Welcome to HUMOVARE',
    preheader: 'Your account is ready. Heavyweight essentials, built for your movement.',
    body: [
      Heading('Welcome to HUMOVARE'),
      Paragraph(greeting),
      Paragraph(
        'Your account is ready. You can now save pieces to your wishlist, check out faster and follow every order from your account.',
      ),
      Paragraph(
        'Everything we make is built the other way round: heavier fabric than the category expects, seams taped where they take strain, colour dyed to hold.',
        { muted: true },
      ),
      PrimaryButton({ href: shopUrl, label: 'Shop now' }),
      FallbackLink(env.frontendUrl),
    ].join(''),
  });

  const text = textEmail([
    'Welcome to HUMOVARE',
    '',
    greeting,
    '',
    'Your account is ready. You can now save pieces to your wishlist, check out faster and follow every order from your account.',
    '',
    `Shop now: ${shopUrl}`,
  ]);

  return { subject: 'Welcome to HUMOVARE', html, text };
}

export default welcomeEmail;
