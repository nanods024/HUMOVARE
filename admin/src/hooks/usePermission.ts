import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * Permission helpers for hiding UI the current admin cannot use.
 *
 * Purely cosmetic — the server re-checks every request — but it keeps
 * operators out of screens that would only return 403.
 */
export function usePermission() {
  const permissions = useAuthStore((state) => state.permissions);
  const role = useAuthStore((state) => state.user?.role);

  const can = useCallback(
    (...required: string[]) => required.every((permission) => permissions.includes(permission)),
    [permissions],
  );

  const canAny = useCallback(
    (...required: string[]) => required.some((permission) => permissions.includes(permission)),
    [permissions],
  );

  return { can, canAny, permissions, isSuperAdmin: role === 'SUPER_ADMIN' };
}
