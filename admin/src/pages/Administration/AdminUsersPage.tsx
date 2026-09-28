import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Plus, KeyRound, Ban, CheckCircle2, Trash2, AlertTriangle, LockOpen, Sparkles } from 'lucide-react';

import { adminUsersApi, rolesApi } from '@/api/endpoints';
import { getErrorMessage } from '@/api/client';
import { queryKeys } from '@/lib/queryKeys';
import { usePermission } from '@/hooks/usePermission';
import { PERMISSIONS as P, ROLE_LABELS } from '@/permissions';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/utils/format';
import type { AdminUser } from '@/types';
import {
  PageHeader, Panel, Button, Input, Select, Badge, Modal, TableSkeleton, EmptyState,
  ErrorState, ConfirmDialog, Pagination,
} from '@/components/ui';
import { PAGE_SIZE } from '@/lib/pagination';
import { useTableQuery } from '@/hooks/useTableQuery';
import { passwordMeetsPolicy } from '@/lib/passwordPolicy';
import { PasswordChecklist } from '@/components/common/PasswordChecklist';
import { BlockedNetworksPanel } from '@/components/common/BlockedNetworksPanel';
import { useSecurityStore } from '@/store/securityStore';

/** A strong temporary password: 16 characters from every character class. */
function generatePassword() {
  const sets = ['abcdefghijkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*?'];
  const all = sets.join('');
  const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const chars = sets.map((set) => set[random(set.length)]);
  while (chars.length < 16) chars.push(all[random(all.length)]);
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { can, isSuperAdmin } = usePermission();
  const currentUser = useAuthStore((state) => state.user);
  const lockoutScope = useSecurityStore((state) => state.policy.lockoutScope);

  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ADMIN' });
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const { page, setPage } = useTableQuery();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.adminUsers.list({ page }),
    queryFn: () => adminUsersApi.list({ page, limit: PAGE_SIZE }),
  });

  const { data: roleData } = useQuery({
    queryKey: queryKeys.roles,
    queryFn: rolesApi.list,
    enabled: can(P.ROLES_MANAGE),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers.all });

  const unlock = useMutation({
    mutationFn: (id: string) => adminUsersApi.unlock(id),
    onSuccess: (result) => {
      toast.success(`${result.admin.email} can sign in again`);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not unlock that account')),
  });

  /** Only a super admin may act on a super admin's account (the server agrees). */
  const canManage = (admin: AdminUser) => isSuperAdmin || admin.role !== 'SUPER_ADMIN';

  const create = useMutation({
    mutationFn: () => adminUsersApi.create(form),
    onSuccess: () => {
      toast.success('Admin created — they must change the password on first sign-in');
      setIsCreating(false);
      setForm({ name: '', email: '', password: '', role: 'ADMIN' });
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not create that admin')),
  });

  const setActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminUsersApi.setActive(id, isActive),
    onSuccess: () => {
      toast.success('Admin updated');
      setToggling(null);
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not update that admin')),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      adminUsersApi.resetPassword(id, password),
    onSuccess: () => {
      toast.success('Password reset — all their sessions were revoked');
      setResetting(null);
      setNewPassword('');
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not reset that password')),
  });

  const deleteAdmin = useMutation({
    mutationFn: (id: string) => adminUsersApi.remove(id),
    onSuccess: () => {
      toast.success('Admin permanently deleted');
      closeDelete();
      invalidate();
    },
    onError: (error) => toast.error(getErrorMessage(error, 'Could not delete that admin')),
  });

  const closeDelete = () => {
    setDeleting(null);
    setDeleteConfirmText('');
  };

  // Only a super admin may mint another one; the server enforces this too.
  const assignableRoles = (roleData?.roles ?? [])
    .map((role) => role.name)
    .filter((name) => isSuperAdmin || name !== 'SUPER_ADMIN');

  const admins = data?.admins ?? [];

  if (isError) return <ErrorState title="Could not load admin users" onRetry={() => refetch()} />;

  return (
    <>
      <PageHeader
        title="Admin users"
        description="Who can sign in to this portal, and what they are allowed to do."
        breadcrumbs={[{ label: 'Administration' }, { label: 'Admin users' }]}
        actions={
          can(P.ADMINS_CREATE) && (
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New admin
            </Button>
          )
        }
      />

      <Panel>
        {isLoading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : admins.length === 0 ? (
          <EmptyState icon={Shield} title="No admin users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/50 text-left text-xs text-ink-muted">
                  <th scope="col" className="px-5 py-2.5 font-medium">Admin</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Role</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Last sign-in</th>
                  <th scope="col" className="py-2.5 pr-4 font-medium">Status</th>
                  <th scope="col" className="py-2.5 pr-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {admins.map((admin) => {
                  const isSelf = admin.id === currentUser?.id;

                  return (
                    <tr key={admin.id} className="hover:bg-canvas/60">
                      <td className="px-5 py-3">
                        <p className="font-medium text-ink">
                          {admin.name}
                          {isSelf && <span className="ml-2 text-xs font-normal text-ink-subtle">(you)</span>}
                        </p>
                        <p className="text-xs text-ink-subtle">{admin.email}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={admin.role === 'SUPER_ADMIN' ? 'primary' : 'neutral'}>
                          {ROLE_LABELS[admin.role] ?? admin.role}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-ink-subtle">
                        {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : 'Never'}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={admin.isActive ? 'success' : 'danger'}>
                            {admin.isActive ? 'Active' : 'Disabled'}
                          </Badge>
                          {admin.mustChangePassword && <Badge tone="warning">Must reset</Badge>}
                          {admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now() && (
                            <Badge tone="danger">
                              Locked until {new Date(admin.lockedUntil).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-5">
                        <div className="flex items-center justify-end gap-1">
                          {can(P.ADMINS_UPDATE) && canManage(admin) && admin.lockedUntil && new Date(admin.lockedUntil).getTime() > Date.now() && (
                            <button
                              type="button"
                              onClick={() => unlock.mutate(admin.id)}
                              aria-label={`Unlock sign-in for ${admin.email}`}
                              title="Unlock sign-in"
                              className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
                            >
                              <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {can(P.ADMINS_UPDATE) && canManage(admin) && !isSelf && (
                            <button
                              type="button"
                              onClick={() => setResetting(admin)}
                              aria-label={`Reset password for ${admin.email}`}
                              className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                          {can(P.ADMINS_DISABLE) && canManage(admin) && !isSelf && (
                            <button
                              type="button"
                              onClick={() => setToggling(admin)}
                              aria-label={`${admin.isActive ? 'Disable' : 'Enable'} ${admin.email}`}
                              className="rounded p-1.5 text-ink-muted hover:bg-canvas hover:text-ink"
                            >
                              {admin.isActive ? <Ban className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            </button>
                          )}
                          {isSuperAdmin && can(P.ADMINS_DELETE) && !isSelf && (
                            <button
                              type="button"
                              onClick={() => setDeleting(admin)}
                              aria-label={`Permanently delete ${admin.email}`}
                              className="rounded p-1.5 text-ink-muted hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data?.pagination && (
          <Pagination
            pageSize={PAGE_SIZE}
            page={data.pagination.currentPage}
            totalPages={data.pagination.totalPages}
            total={data.pagination.totalItems}
            onChange={setPage}
          />
        )}
      </Panel>

      {isSuperAdmin && lockoutScope === 'network' && <BlockedNetworksPanel />}

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="New admin user"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
            <Button
              onClick={() => create.mutate()}
              isLoading={create.isPending}
              disabled={!form.name || !form.email || !passwordMeetsPolicy(form.password)}
            >
              Create admin
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <div>
            <div className="flex items-end gap-2">
              <Input
                label="Temporary password"
                type="text"
                autoComplete="off"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                containerClassName="flex-1"
                hint="Share it privately. They must change it on first sign-in."
              />
              <Button variant="outline" onClick={() => setForm({ ...form, password: generatePassword() })} className="mb-5">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Generate
              </Button>
            </div>
            <PasswordChecklist value={form.password} className="mt-2" />
          </div>
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {assignableRoles.map((role) => (
              <option key={role} value={role}>{ROLE_LABELS[role] ?? role}</option>
            ))}
          </Select>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title={`Reset password — ${resetting?.email ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(null)}>Cancel</Button>
            <Button
              onClick={() => resetting && resetPassword.mutate({ id: resetting.id, password: newPassword })}
              isLoading={resetPassword.isPending}
              disabled={!passwordMeetsPolicy(newPassword)}
            >
              Reset password
            </Button>
          </>
        }
      >
        <div>
          <div className="flex items-end gap-2">
            <Input
              label="New temporary password"
              type="text"
              autoComplete="off"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              containerClassName="flex-1"
              hint="Their sessions end at once, and they must change it on next sign-in."
            />
            <Button variant="outline" onClick={() => setNewPassword(generatePassword())} className="mb-5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Generate
            </Button>
          </div>
          <PasswordChecklist value={newPassword} className="mt-2" />
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={() => toggling && setActive.mutate({ id: toggling.id, isActive: !toggling.isActive })}
        title={toggling?.isActive ? 'Disable this admin?' : 'Enable this admin?'}
        message={
          toggling?.isActive
            ? `${toggling?.email} will be signed out everywhere immediately and will not be able to sign back in.`
            : `${toggling?.email} will be able to sign in again.`
        }
        confirmLabel={toggling?.isActive ? 'Disable' : 'Enable'}
        tone={toggling?.isActive ? 'danger' : 'primary'}
        isLoading={setActive.isPending}
      />

      <Modal
        isOpen={Boolean(deleting)}
        onClose={closeDelete}
        title="Permanently delete this admin?"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={closeDelete}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => deleting && deleteAdmin.mutate(deleting.id)}
              isLoading={deleteAdmin.isPending}
              disabled={deleteConfirmText.trim().toLowerCase() !== deleting?.email.toLowerCase()}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="flex gap-2 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              This removes <strong>{deleting?.email}</strong> and every session it ever held, from the
              database, immediately. There is no undo — disable the account instead if you might need it again.
            </span>
          </p>
          <Input
            label={`Type "${deleting?.email ?? ''}" to confirm`}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            autoComplete="off"
          />
        </div>
      </Modal>
    </>
  );
}

export default AdminUsersPage;
