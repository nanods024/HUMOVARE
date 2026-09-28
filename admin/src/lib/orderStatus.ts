import type { OrderStatus } from '@/types';

/**
 * Valid next statuses, mirroring the server's transition graph.
 *
 * The server is authoritative — it rejects an illegal move — but offering only
 * the legal options keeps an operator from discovering that through an error.
 */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** Statuses where the items are still in the warehouse — deleting returns them to stock. */
export const HOLDS_STOCK: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];
