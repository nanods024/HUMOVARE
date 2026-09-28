import { Wishlist } from '../models/Wishlist.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/ApiError.js';

const CARD_FIELDS =
  'name slug price mrp discountPercentage thumbnail images colors sizes gender stock variants isNewDrop isBestSeller rating category';

async function getOrCreate(userId) {
  const wishlist = await Wishlist.findOne({ user: userId });
  if (wishlist) return wishlist;
  return Wishlist.create({ user: userId, products: [] });
}

export async function getWishlist(userId) {
  const wishlist = await getOrCreate(userId);
  await wishlist.populate({
    path: 'products',
    select: CARD_FIELDS,
    match: { isActive: true },
    populate: { path: 'category', select: 'name slug' },
  });

  // `match` leaves nulls where a product was deactivated; drop them.
  const products = wishlist.products.filter(Boolean);

  return {
    id: wishlist._id.toString(),
    products,
    count: products.length,
    productIds: products.map((product) => product._id.toString()),
  };
}

/** Returns just the ids so the grid can render heart states cheaply. */
export async function getWishlistIds(userId) {
  const wishlist = await Wishlist.findOne({ user: userId }).select('products').lean();
  return (wishlist?.products ?? []).map((id) => id.toString());
}

export async function addToWishlist(userId, productId) {
  const exists = await Product.exists({ _id: productId, isActive: true });
  if (!exists) throw ApiError.notFound('This product is no longer available');

  // $addToSet keeps the operation idempotent — double-tapping a heart on a
  // flaky connection must not create duplicates.
  await Wishlist.findOneAndUpdate(
    { user: userId },
    { $addToSet: { products: productId } },
    { upsert: true, new: true },
  );

  return getWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  await Wishlist.findOneAndUpdate({ user: userId }, { $pull: { products: productId } });
  return getWishlist(userId);
}

export default {
  getWishlist,
  getWishlistIds,
  addToWishlist,
  removeFromWishlist,
};
