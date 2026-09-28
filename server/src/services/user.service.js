import { User } from '../models/User.js';
import { Address } from '../models/Address.js';
import { ApiError } from '../utils/ApiError.js';
import { codCityPinError } from './storeSettings.service.js';

/** Refuses a city/PIN pair that cannot both be right (see codCityPinError). */
function assertCityMatchesPin(address) {
  const message = codCityPinError(address);
  if (message) {
    throw ApiError.unprocessable(message, { details: [{ field: 'postalCode', message }] });
  }
}

const MAX_ADDRESSES = 10;

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('Account not found');

  const addresses = await Address.find({ user: userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();

  return { ...user.toPublicJSON(), addresses };
}

export async function updateProfile(userId, payload) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('Account not found');

  // Email and role are deliberately not updatable here — changing an email
  // needs a verification flow, and role is never a self-service field.
  if (payload.name !== undefined) user.name = payload.name;
  if (payload.phone !== undefined) user.phone = payload.phone;

  await user.save();
  return user.toPublicJSON();
}

export async function listAddresses(userId) {
  return Address.find({ user: userId }).sort({ isDefault: -1, updatedAt: -1 }).lean();
}

export async function createAddress(userId, payload) {
  assertCityMatchesPin(payload);
  const count = await Address.countDocuments({ user: userId });
  if (count >= MAX_ADDRESSES) {
    throw ApiError.badRequest(`You can save up to ${MAX_ADDRESSES} addresses`);
  }

  // The very first address becomes the default automatically.
  const address = await Address.create({
    ...payload,
    user: userId,
    isDefault: payload.isDefault ?? count === 0,
  });

  return address.toObject();
}

export async function updateAddress(userId, addressId, payload) {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) throw ApiError.notFound('Address not found');

  for (const [key, value] of Object.entries(payload)) {
    address[key] = value;
  }
  assertCityMatchesPin(address);

  await address.save();
  return address.toObject();
}

export async function deleteAddress(userId, addressId) {
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) throw ApiError.notFound('Address not found');

  const wasDefault = address.isDefault;
  await address.deleteOne();

  // Never leave the account without a default while addresses remain.
  if (wasDefault) {
    const next = await Address.findOne({ user: userId }).sort({ updatedAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }

  return { deleted: true };
}

export default {
  getProfile,
  updateProfile,
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
};
