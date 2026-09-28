import cloudinary, { isCloudinaryConfigured } from '../config/cloudinary.js';
import { logger } from '../utils/logger.js';

/**
 * Removes a stored image. Uploads never pass through this server — the admin
 * uploads straight to Cloudinary with a signature minted in media.service.
 */
export async function destroyImage(publicId) {
  if (!publicId || !isCloudinaryConfigured()) return null;
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    // A failed cleanup should never fail the request that triggered it.
    logger.warn('Cloudinary destroy failed', { publicId, message: error.message });
    return null;
  }
}

export default { destroyImage };
