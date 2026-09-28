import * as wishlistService from '../services/wishlist.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.getWishlist(req.user._id);
  return sendSuccess(res, { message: 'Wishlist fetched successfully', data: { wishlist } });
});

export const getWishlistIds = asyncHandler(async (req, res) => {
  const productIds = await wishlistService.getWishlistIds(req.user._id);
  return sendSuccess(res, { message: 'Wishlist ids fetched', data: { productIds } });
});

export const addToWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.addToWishlist(req.user._id, req.params.productId);
  return sendCreated(res, { message: 'Saved to wishlist', data: { wishlist } });
});

export const removeFromWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.removeFromWishlist(req.user._id, req.params.productId);
  return sendSuccess(res, { message: 'Removed from wishlist', data: { wishlist } });
});

