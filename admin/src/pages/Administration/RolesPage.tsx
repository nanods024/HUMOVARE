import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock } from 'lucide-react';

import { rolesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { PERMISSION_GROUPS, ROLE_LABELS } from '@/permissions';
import { toast } from '@/store/toastStore';
import type { Role } from '@/types';
import { PageHeader, Panel, Button, Badge, Checkbox, Skeleton, ErrorState, Pagination } from '@/components/ui';
import { PAGE_SIZE, usePagedList } from '@/lib/pagination';

export function RolesPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string[]>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.roles,
    queryFn: rolesApi.list,
  });

  const save = useMutation({
    mutationFn: ({ id, permissions }: { id: string; permissions: string[] }) =>
      rolesApi.update(id, { permissions }),
    onSuccess: (result) => {
      toast.success(`${ROLE_LABELS[result.role.name] ?? result.role.name} updated`);
      setDraft((current) => {
        const next = { ...current };
        delete next[result.role._id];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.roles });
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update that role')),
  });

  // Before the early returns: hooks must run on every render.
  const roles = data?.roles ?? [];
  const rolePage = usePagedList(roles);

  if (isError) return <ErrorState title="Could not load roles" onRetry={() => refetch()} />;
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }


  const permissionsFor = (role: Role) => draft[role._id] ?? role.permissions;

  const toggle = (role: Role, permission: string) => {
    const current = permissionsFor(role);
    const next = current.includes(permission)
      ? current.filter((item) => item !== permission)
      : [...current, permission];
    setDraft({ ...draft, [role._id]: next });
  };

  return (
    <>
      <PageHeader
        title="Roles"
        description="Permission bundles. Changing a role signs its admins out so nothing stays over-entitled."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Roles' }]}
      />

      <div className="stagger space-y-4">
        {rolePage.entries.map(({ item: role }) => {
          const isOwner = role.name === 'SUPER_ADMIN';
          const selected = permissionsFor(role);
          const isDirty = Boolean(draft[role._id]);

          return (
            <Panel
              key={role._id}
              title={ROLE_LABELS[role.name] ?? role.name}
              description={role.description}
              actions={
                isOwner ? (
                  <Badge tone="primary">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    All permissions
                  </Badge>
                ) : (
                  isDirty && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const next = { ...draft };
                          delete next[role._id];
                          setDraft(next);
                        }}
                      >
                        Discard
                      </Button>
                      <Button size="sm" onClick={() => save.mutate({ id: role._id, permissions: selected })} isLoading={save.isPending}>
                        Save
                      </Button>
                    </div>
                  )
                )
              }
            >
              {isOwner ? (
                <p className="px-5 py-4 text-sm text-ink-muted">
                  The super admin role always holds every permission, including ones added in future
                  releases. It cannot be edited — that guarantee is what stops an upgrade silently
                  locking the owner out of a new area.
                </p>
              ) : (
                <div className="grid gap-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {PERMISSION_GROUPS.map((group) => (
                    <div key={group.group}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
                        {group.group}
                      </p>
                      <div className="space-y-1.5">
                        {group.permissions.map((permission) => (
                          <Checkbox
                            key={permission}
                            label={permission.split('.')[1]}
                            checked={selected.includes(permission)}
                            onChange={() => toggle(role, permission)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      {roles.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-canvas">
          <Pagination
            pageSize={PAGE_SIZE}
            page={rolePage.page}
            totalPages={rolePage.totalPages}
            total={rolePage.total}
            onChange={rolePage.setPage}
          />
        </div>
      )}

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-subtle">
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Permissions are checked on the server for every request. Removing one here takes effect
        immediately, even for an admin who is currently signed in.
      </p>
    </>
  );
}

export default RolesPage;
