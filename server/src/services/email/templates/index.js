import { EMAIL_TYPES } from '../../../models/EmailEvent.js';
import { welcomeEmail } from './welcome.js';
import { passwordResetEmail } from './passwordReset.js';
import { orderConfirmationEmail } from './orderConfirmation.js';
import { paymentSuccessEmail, paymentFailedEmail } from './payment.js';
import {
  orderProcessingEmail,
  orderShippedEmail,
  orderOutForDeliveryEmail,
  orderDeliveredEmail,
  orderCancelledEmail,
} from './orderStatus.js';
import { adminPasswordResetEmail, adminPasswordChangedEmail, adminSecurityAlertEmail, adminPanelLockedEmail } from './adminSecurity.js';

/**
 * Email type → template.
 *
 * The one table to read when asking "what does the customer get for X". Each
 * template is a pure function of its view model and returns
 * `{ subject, html, text }`, so any of them can be rendered in isolation for a
 * preview or a test.
 */
export const TEMPLATES = Object.freeze({
  [EMAIL_TYPES.WELCOME]: welcomeEmail,
  [EMAIL_TYPES.PASSWORD_RESET]: passwordResetEmail,
  [EMAIL_TYPES.ORDER_CONFIRMATION]: orderConfirmationEmail,
  [EMAIL_TYPES.PAYMENT_SUCCESS]: paymentSuccessEmail,
  [EMAIL_TYPES.PAYMENT_FAILED]: paymentFailedEmail,
  [EMAIL_TYPES.ORDER_PROCESSING]: orderProcessingEmail,
  [EMAIL_TYPES.ORDER_SHIPPED]: orderShippedEmail,
  [EMAIL_TYPES.ORDER_OUT_FOR_DELIVERY]: orderOutForDeliveryEmail,
  [EMAIL_TYPES.ORDER_DELIVERED]: orderDeliveredEmail,
  [EMAIL_TYPES.ORDER_CANCELLED]: orderCancelledEmail,
  [EMAIL_TYPES.ADMIN_PASSWORD_RESET]: adminPasswordResetEmail,
  [EMAIL_TYPES.ADMIN_PASSWORD_CHANGED]: adminPasswordChangedEmail,
  [EMAIL_TYPES.ADMIN_SECURITY_ALERT]: adminSecurityAlertEmail,
  [EMAIL_TYPES.ADMIN_PANEL_LOCKED]: adminPanelLockedEmail,
});

export function renderTemplate(type, viewModel) {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`No email template for ${type}`);
  return template(viewModel);
}

export default renderTemplate;
