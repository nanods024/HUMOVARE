import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, LockOpen } from 'lucide-react';

import { securityApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { toast } from '@/store/toastStore';
import { Panel, Button, Badge } from '@/components/ui';

const KEY = ['security', 'blocked-ips'] as const;

/**
 * Networks currently shut out of the admin panel after too many wrong
 * passwords. Super admins can lift a block early — for example when a
 * colleague on the office network mistyped their password.
 */
export function BlockedNetworksPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: securityApi.blockedIps,
    refetchInterval: 30_000,
  });

  const unblock = useMutation({
    mutationFn: (id: string) => securityApi.unblockIp(id),
    onSuccess: () => {
      toast.success('Network unblocked — it can sign in again');
      queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not lift that block')),
  });

  const blocks = data?.blocks ?? [];

  return (
    <Panel
      title="Blocked networks"
      description="Networks with 3 wrong password attempts are blocked from the whole admin panel for 30 minutes."
      className="mt-6"
    >
      {isLoading ? (
        <p className="px-5 py-6 text-sm text-ink-subtle">Loading…</p>
      ) : blocks.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-ink-muted">
          <Globe className="h-4 w-4 text-success" aria-hidden="true" />
          No networks are blocked right now.
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="font-mono text-sm text-ink">{block.ip}</span>
              <Badge tone="danger">
                Blocked until {new Date(block.blockedUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => unblock.mutate(block.id)}
                isLoading={unblock.isPending && unblock.variables === block.id}
              >
                <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default BlockedNetworksPanel;
