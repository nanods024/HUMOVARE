import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { ORDER_STATUS, LOW_STOCK_THRESHOLD } from '../constants/index.js';

/** Orders that represent real revenue — cancelled ones are excluded. */
const REVENUE_MATCH = { orderStatus: { $ne: ORDER_STATUS.CANCELLED } };

/** Resolves a named range, or a custom from/to pair, into dates. */
export function resolveRange(range = 'last-30-days', from, to) {
  const now = new Date();
  const end = to ? new Date(to) : new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = from ? new Date(from) : new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'last-7-days':
      start.setDate(start.getDate() - 6);
      break;
    case 'last-30-days':
      start.setDate(start.getDate() - 29);
      break;
    case 'this-month':
      start.setDate(1);
      break;
    case 'custom':
      break;
    default:
      start.setDate(start.getDate() - 29);
  }

  return { start, end };
}

/**
 * Dashboard figures, all computed from the database.
 *
 * Nothing here is synthesised — an empty store shows zeroes rather than
 * plausible-looking numbers, which is the only honest behaviour for a screen
 * a business will make decisions from.
 */
export async function getDashboard({ range, from, to } = {}) {
  const { start, end } = resolveRange(range, from, to);
  const inRange = { createdAt: { $gte: start, $lte: end } };

  const [
    revenueAgg,
    statusCounts,
    productCounts,
    customerCount,
    newCustomers,
    revenueTrend,
    topProducts,
    recentOrders,
    lowStock,
  ] = await Promise.all([
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, ...inRange } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
          items: { $sum: { $sum: '$items.quantity' } },
        },
      },
    ]),

    Order.aggregate([
      { $match: inRange },
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]),

    Product.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', LOW_STOCK_THRESHOLD] }] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),

    User.countDocuments({}),
    User.countDocuments(inRange),

    // Daily series for the revenue / orders chart.
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, ...inRange } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    Order.aggregate([
      { $match: { ...REVENUE_MATCH, ...inRange } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          slug: { $first: '$items.slug' },
          image: { $first: '$items.image' },
          unitsSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 8 },
    ]),

    Order.find({})
      .sort({ createdAt: -1 })
      .limit(8)
      .select('orderNumber total orderStatus paymentStatus createdAt shippingAddress.name')
      .lean(),

    Product.find({ isActive: true, stock: { $gt: 0, $lte: LOW_STOCK_THRESHOLD } })
      .select('name slug stock thumbnail')
      .sort({ stock: 1 })
      .limit(8)
      .lean(),
  ]);

  const totals = revenueAgg[0] ?? { revenue: 0, orders: 0, items: 0 };
  const byStatus = Object.fromEntries(statusCounts.map((row) => [row._id, row.count]));
  const products = productCounts[0] ?? { total: 0, active: 0, outOfStock: 0, lowStock: 0 };

  return {
    range: { start, end, key: range ?? 'last-30-days' },
    totals: {
      revenue: totals.revenue,
      orders: totals.orders,
      itemsSold: totals.items,
      averageOrderValue: totals.orders ? Math.round(totals.revenue / totals.orders) : 0,
      customers: customerCount,
      newCustomers,
    },
    orders: {
      pending: byStatus[ORDER_STATUS.PENDING] ?? 0,
      confirmed: byStatus[ORDER_STATUS.CONFIRMED] ?? 0,
      processing: byStatus[ORDER_STATUS.PROCESSING] ?? 0,
      shipped: byStatus[ORDER_STATUS.SHIPPED] ?? 0,
      outForDelivery: byStatus[ORDER_STATUS.OUT_FOR_DELIVERY] ?? 0,
      delivered: byStatus[ORDER_STATUS.DELIVERED] ?? 0,
      cancelled: byStatus[ORDER_STATUS.CANCELLED] ?? 0,
    },
    products,
    charts: {
      trend: revenueTrend.map((row) => ({ date: row._id, revenue: row.revenue, orders: row.orders })),
      topProducts,
    },
    recentOrders,
    lowStock,
  };
}

export default { getDashboard, resolveRange };
