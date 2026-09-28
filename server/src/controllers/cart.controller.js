import * as cartService from '../services/cart.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user._id);
  return sendSuccess(res, { message: 'Cart fetched successfully', data: { cart } });
});

export const addItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addItem(req.user._id, req.body);
  return sendCreated(res, { message: 'Added to bag', data: { cart } });
});

export const updateItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateItem(req.user._id, req.params.itemId, req.body.quantity);
  return sendSuccess(res, { message: 'Bag updated', data: { cart } });
});

export const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id, req.params.itemId);
  return sendSuccess(res, { message: 'Removed from bag', data: { cart } });
});

export const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user._id);
  return sendSuccess(res, { message: 'Bag cleared', data: { cart } });
});

/** Called once, right after sign-in, with whatever the guest had locally. */
export const mergeCart = asyncHandler(async (req, res) => {
  const cart = await cartService.mergeGuestCart(req.user._id, req.body.items);
  return sendSuccess(res, { message: 'Bag synced', data: { cart } });
});
