import { useMutation, useQueryClient } from '@tanstack/react-query';

import { ordersApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { HOLDS_STOCK } from '@/lib/orderStatus';
import { toast } from '@/store/toastStore';
import type { AdminOrder } from '@/types';
import { TypeToConfirmDialog } from '@/components/common/TypeToConfirmDialog';

/** Permanently deletes one order. Super admin only; the server enforces it too. */
export function DeleteOrderDialog({ order, onClose, onDeleted }: {
  order: AdminOrder | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => ordersApi.remove(id),
    onSuccess: ({ restocked }) => {
      toast.success(restocked ? 'Order deleted · items returned to stock' : 'Order deleted');
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
      onDeleted();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete this order')),
  });

  return (
    <TypeToConfirmDialog
      isOpen={Boolean(order)}
      onClose={onClose}
      onConfirm={() => order && remove.mutate(order._id)}
      title="Delete this order permanently?"
      confirmText={order?.orderNumber ?? ''}
      isLoading={remove.isPending}
    >
      <p>
        <strong className="text-ink">{order?.orderNumber}</strong> will be removed from the admin, from the
        customer&apos;s account, and from the database — with its payment and email history. This cannot be undone.
      </p>
      {order && HOLDS_STOCK.includes(order.orderStatus) && (
        <p>The items have not shipped, so they go back into stock.</p>
      )}
      {order?.paymentStatus === 'PAID' && (
        <p className="font-medium text-danger">This order is paid. Deleting it removes the record of that payment.</p>
      )}
    </TypeToConfirmDialog>
  );
}

export default DeleteOrderDialog;
