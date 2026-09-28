import { Router } from 'express';
import authRoutes from './auth.routes.js';
import productRoutes from './product.routes.js';
import categoryRoutes from './category.routes.js';
import cartRoutes from './cart.routes.js';
import wishlistRoutes from './wishlist.routes.js';
import orderRoutes from './order.routes.js';
import userRoutes from './user.routes.js';
import storefrontRoutes from './storefront.routes.js';
import feedbackRoutes from './feedback.routes.js';
import paymentRoutes from './payment.routes.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.get('/', (_req, res) =>
  sendSuccess(res, {
    message: 'HUMOVARE API',
    data: {
      version: '1.0.0',
      endpoints: [
        '/api/auth',
        '/api/products',
        '/api/categories',
        '/api/cart',
        '/api/wishlist',
        '/api/orders',
        '/api/users',
        '/api/homepage',
        '/api/shop-config',
        '/api/collections',
        '/api/settings',
        '/api/feedback',
        '/api/payments',
      ],
    },
  }),
);

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/orders', orderRoutes);
router.use('/users', userRoutes);
router.use('/payments', paymentRoutes);

// Admin-managed storefront content (home page, shop page, collections).
router.use('/', storefrontRoutes);

// The contact form, which does not hang off a single noun.
router.use('/', feedbackRoutes);

export default router;
