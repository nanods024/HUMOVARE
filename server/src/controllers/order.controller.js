import * as orderService from '../services/order.service.js';
import { paymentService } from '../services/payment.service.js';
import * as onlinePayment from '../services/payments/onlinePayment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

/**
 * What a customer may see of their own order. Status notes are the team's
 * (the admin screen calls them "team notes"), and payment review flags or
 * gateway ids are internal — only the timeline and the payment reference go
 * out.
 */
function toCustomerOrder(order) {
  if (!order) return order;
  const { statusHistory = [], payment, ...rest } = order;
  return {
    ...rest,
    statusHistory: statusHistory.map(({ status, at }) => ({ status, at })),
    payment: payment ? { reference: payment.reference, paidAt: payment.paidAt ?? null } : payment,
  };
}

export const createOrder = asyncHandler(async (req, res) => {
  const { order, payment, notifications } = await orderService.createOrder(req.user._id, req.body);

  return sendCreated(res, {
    message: 'Order placed successfully',
    data: { order: toCustomerOrder(order), payment, notifications },
  });
});

export const getPaymentStatus = asyncHandler(async (req, res) => {
  const payment = await onlinePayment.getPaymentStatus(req.user._id, req.params.id);
  res.set('Cache-Control', 'no-store');
  return sendSuccess(res, { message: 'Payment status fetched', data: { payment } });
});

export const retryPayment = asyncHandler(async (req, res) => {
  const payment = await onlinePayment.retryPayment(req.user._id, req.params.id);
  return sendSuccess(res, { message: 'Payment ready', data: { payment } });
});

export const listOrders = asyncHandler(async (req, res) => {
  const { orders, pagination } = await orderService.listOrders(
    req.user._id,
    req.validatedQuery ?? {},
  );

  return sendSuccess(res, {
    message: 'Orders fetched successfully',
    data: { orders: orders.map(toCustomerOrder), pagination },
  });
});

export const getOrder = asyncHandler(async (req, res) => {
  // Always scoped to the signed-in customer: nobody reads another person's
  // order through this route, whatever their account says about itself.
  const order = await orderService.getOrder(req.user._id, req.params.id);

  return sendSuccess(res, { message: 'Order fetched successfully', data: { order: toCustomerOrder(order) } });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const { order, notifications } = await orderService.cancelOrder(req.user._id, req.params.id, req.body?.reason);
  return sendSuccess(res, { message: 'Order cancelled', data: { order: toCustomerOrder(order), notifications } });
});

/** Checkout asks which payment methods this environment actually supports. */
export const getPaymentMethods = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    message: 'Payment methods fetched',
    data: { methods: paymentService.availableMethods() },
  }),
);


