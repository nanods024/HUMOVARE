import * as userService from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getMe = asyncHandler(async (req, res) => {
  const profile = await userService.getProfile(req.user._id);
  return sendSuccess(res, { message: 'Profile fetched successfully', data: { user: profile } });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  return sendSuccess(res, { message: 'Profile updated', data: { user } });
});

export const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await userService.listAddresses(req.user._id);
  return sendSuccess(res, { message: 'Addresses fetched', data: { addresses } });
});

export const createAddress = asyncHandler(async (req, res) => {
  const address = await userService.createAddress(req.user._id, req.body);
  return sendCreated(res, { message: 'Address saved', data: { address } });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const address = await userService.updateAddress(req.user._id, req.params.id, req.body);
  return sendSuccess(res, { message: 'Address updated', data: { address } });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const result = await userService.deleteAddress(req.user._id, req.params.id);
  return sendSuccess(res, { message: 'Address removed', data: result });
});
