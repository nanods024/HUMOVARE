import { asyncHandler } from '../utils/asyncHandler.js';
import { handleWebhook } from '../services/payments/onlinePayment.service.js';

export const phonepeWebhook = asyncHandler(async (req, res) => {
  const { statusCode, body } = await handleWebhook({
    authorization: req.get('authorization'),
    body: req.body,
  });
  res.set('Cache-Control', 'no-store');
  return res.status(statusCode).json(body);
});
