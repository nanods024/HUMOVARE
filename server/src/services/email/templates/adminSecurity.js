import {
  EmailLayout, Heading, Paragraph, PrimaryButton, FallbackLink, Notice, DetailRows, textEmail, formatDate,
} from './components.js';

/**
 * Admin-portal security emails. They carry the minimum: no passwords (the
 * server never has them), no tokens beyond the one-time reset link, and only
 * enough context to recognise the event.
 */

const greetingFor = (name) => {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi,';
};

export function adminPasswordResetEmail({ name, resetUrl, expiresInMinutes }) {
  const greeting = greetingFor(name);
  const expiry = `This link expires in ${expiresInMinutes} minutes and can only be used once.`;
  const ignore = 'If you did not ask for this, ignore this email — your password stays the same. Tell the store owner if it keeps happening.';

  const html = EmailLayout({
    title: 'Reset your HUMOVARE admin password',
    preheader: `Use this link within ${expiresInMinutes} minutes.`,
    body: [
      Heading('Reset your admin password'),
      Paragraph(greeting),
      Paragraph('Someone asked to reset the password for your HUMOVARE admin portal account. Choose a new one with the button below.'),
      PrimaryButton({ href: resetUrl, label: 'Choose a new password' }),
      Paragraph(expiry, { muted: true, size: 13 }),
      FallbackLink(resetUrl),
      Notice(ignore, 'info'),
    ].join(''),
  });

  const text = textEmail([
    'Reset your HUMOVARE admin password', '', greeting, '',
    'Someone asked to reset the password for your HUMOVARE admin portal account.', '',
    `Choose a new password: ${resetUrl}`, '', expiry, '', ignore,
  ]);

  return { subject: 'Reset your HUMOVARE admin password', html, text };
}

export function adminPasswordChangedEmail({ name, changedAt }) {
  const greeting = greetingFor(name);
  const when = formatDate(changedAt, { withTime: true });
  const warning = 'If this was not you, reset your password straight away and tell the store owner. Every other session has already been signed out.';

  const html = EmailLayout({
    title: 'Your HUMOVARE admin password was changed',
    preheader: `Changed on ${when}.`,
    body: [
      Heading('Your admin password was changed'),
      Paragraph(greeting),
      Paragraph(`The password for your HUMOVARE admin portal account was changed on ${when}.`),
      Notice(warning, 'warning'),
    ].join(''),
  });

  const text = textEmail([
    'Your HUMOVARE admin password was changed', '', greeting, '',
    `The password for your HUMOVARE admin portal account was changed on ${when}.`, '', warning,
  ]);

  return { subject: 'Your HUMOVARE admin password was changed', html, text };
}

export function adminSecurityAlertEmail({ accountEmail, lockedUntil, ip, lockMinutes, attempts }) {
  const until = formatDate(lockedUntil, { withTime: true });

  const html = EmailLayout({
    title: 'Admin sign-in locked',
    preheader: `${attempts} wrong passwords for ${accountEmail}.`,
    body: [
      Heading('Admin sign-in locked'),
      Paragraph(`Sign-in to the HUMOVARE admin portal was locked for ${lockMinutes} minutes after ${attempts} wrong passwords in a row.`),
      DetailRows([
        ['Account', accountEmail],
        ['Locked until', until],
        ['From IP', ip || 'unknown'],
      ]),
      Notice('If this was you, wait for the lock to lift or reset your password. If it was not, someone may be guessing the password — change it once you can sign in, and check the audit log.', 'warning'),
    ].join(''),
  });

  const text = textEmail([
    'Admin sign-in locked', '',
    `Sign-in to the HUMOVARE admin portal was locked for ${lockMinutes} minutes after ${attempts} wrong passwords in a row.`, '',
    `Account: ${accountEmail}`, `Locked until: ${until}`, `From IP: ${ip || 'unknown'}`,
  ]);

  return { subject: `Admin sign-in locked — ${accountEmail}`, html, text };
}

export function adminPanelLockedEmail({ lockedUntil, ip, lockMinutes, attempts, lastEmail }) {
  const until = formatDate(lockedUntil, { withTime: true });
  const help = 'Every admin is signed out until then. If this was a mistake, lift it early from the server with "npm run security:unblock". If it was not you, someone may be guessing passwords — review the audit log once you are back in.';

  const html = EmailLayout({
    title: 'Admin panel locked',
    preheader: `Locked for everyone until ${until}.`,
    body: [
      Heading('Admin panel locked for everyone'),
      Paragraph(`After ${attempts} wrong passwords in a row, the HUMOVARE admin panel is locked for all admins for ${lockMinutes} minutes.`),
      DetailRows([
        ['Locked until', until],
        ['Last attempt from IP', ip || 'unknown'],
        ['Last email tried', lastEmail || 'unknown'],
      ]),
      Notice(help, 'warning'),
    ].join(''),
  });

  const text = textEmail([
    'Admin panel locked for everyone', '',
    `After ${attempts} wrong passwords in a row, the HUMOVARE admin panel is locked for all admins for ${lockMinutes} minutes.`, '',
    `Locked until: ${until}`, `Last attempt from IP: ${ip || 'unknown'}`, `Last email tried: ${lastEmail || 'unknown'}`, '', help,
  ]);

  return { subject: 'Admin panel locked for everyone', html, text };
}

export default { adminPasswordResetEmail, adminPasswordChangedEmail, adminSecurityAlertEmail, adminPanelLockedEmail };
