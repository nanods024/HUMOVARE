import { api } from './client';
import type { Address, AddressInput, User } from '@/types';

export const usersApi = {
  me: () => api.get<{ user: User & { addresses: Address[] } }>('/users/me'),

  updateProfile: (payload: { name?: string; phone?: string }) =>
    api.put<{ user: User }>('/users/me', payload),

  listAddresses: () => api.get<{ addresses: Address[] }>('/users/me/addresses'),

  createAddress: (payload: AddressInput) =>
    api.post<{ address: Address }>('/users/me/addresses', payload),

  updateAddress: (id: string, payload: Partial<AddressInput>) =>
    api.put<{ address: Address }>(`/users/me/addresses/${id}`, payload),

  deleteAddress: (id: string) => api.delete<{ deleted: boolean }>(`/users/me/addresses/${id}`),
};
