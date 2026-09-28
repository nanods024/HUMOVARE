import { api } from './client';
import type { AddressInput, Order, Pagination, PaymentMethod, PaymentMethodOption } from '@/types';

export interface CreateOrderPayload {
  addressId?: string;
  shippingAddress?: AddressInput;
  paymentMethod: PaymentMethod;
  customerNote?: string;
  saveAddress?: boolean;
}

/**
 * What checkout (or "Retry payment") gets back. `redirect` carries PhonePe's
 * hosted checkout link; nothing else about the gateway reaches the browser.
 */
export type CheckoutPayment =
  | { status: 'cod' }
  | { status: 'redirect'; redirectUrl: string; attemptNumber: number; expireAt: string | null; reused?: boolean }
  | { status: 'unavailable'; message: string }
  | { status: 'paid' };

/** The verified state, as the server has it. The browser only ever reads this. */
export interface PaymentStatusView {
  orderId: string;
  orderNumber: string;
  state: 'PAID' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'COD';
  paymentStatus: string;
  orderStatus: string;
  paymentMethod: PaymentMethod;
  amount: number;
  currency: string;
  paidAt: string | null;
  expiresAt: string | null;
  canRetry: boolean;
  attempt: { attemptNumber: number; status: string; expireAt: string | null; paymentMode: string } | null;
}

/**
 * Whether the customer's email went out. `message` is only present on failure
 * and is written for the customer — never a provider error.
 */
export interface OrderNotifications {
  email: 'sent' | 'failed' | 'queued' | 'duplicate' | 'skipped' | 'none';
  message?: string;
}

export const ordersApi = {
  create: (payload: CreateOrderPayload) =>
    api.post<{ order: Order; payment: CheckoutPayment; notifications?: OrderNotifications }>('/orders', payload),

  list: (params: { page?: number; limit?: number; status?: string } = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value));
    });
    return api.get<{ orders: Order[]; pagination: Pagination }>(`/orders?${search.toString()}`);
  },

  detail: (id: string) => api.get<{ order: Order }>(`/orders/${id}`),

  cancel: (id: string, reason?: string) =>
    api.post<{ order: Order; notifications?: OrderNotifications }>(`/orders/${id}/cancel`, { reason }),

  paymentStatus: (id: string) => api.get<{ payment: PaymentStatusView }>(`/orders/${id}/payment-status`),

  retryPayment: (id: string) => api.post<{ payment: CheckoutPayment }>(`/orders/${id}/payment/retry`),

  paymentMethods: () => api.get<{ methods: PaymentMethodOption[] }>('/orders/payment-methods'),
};
