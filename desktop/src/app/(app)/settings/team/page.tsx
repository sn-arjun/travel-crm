'use client';
import { formatDisplayDate } from '@/lib/dates';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  History,
  Lock,
  Mail,
  Pencil,
  Plus,
  Shield,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain/list-page';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { PhoneInput } from '@/components/ui/phone-input';
import { Spinner } from '@/components/ui/spinner';
import { usersApi } from '@/lib/api/users';
import type { User } from '@travelcrm/shared';

type Role = 'admin' | 'sales_manager' | 'salesperson' | 'operations' | 'accountant' | 'view_only';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  sales_manager: 'Sales Manager',
  salesperson: 'Salesperson',
  operations: 'Operations',
  accountant: 'Accountant',
  view_only: 'View only',
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS) as [Role, string][];

function formatDate(iso?: string) {
  if (!iso) return 'Never';
  try {
    return formatDisplayDate(iso) || iso;
  } catch {
    return iso;
  }
}

function initialsOf(name?: string, email?: string) {
  const source = name || email || 'U';
  return source
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface InviteFormState {
  email: string;
  name: string;
  role: Role;
  phone: string;
  department: string;
}

const emptyInvite: InviteFormState = { email: '', name: '', role: 'salesperson', phone: '', department: '' };

export default function TeamSettingsPage() {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);
  const [editRole, setEditRole] = React.useState<Role>('salesperson');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [inviteForm, setInviteForm] = React.useState<InviteFormState>(emptyInvite);
  const [inviteError, setInviteError] = React.useState<string | undefined>();
  const [isInviting, setIsInviting] = React.useState(false);
  const [isSavingRole, setIsSavingRole] = React.useState(false);

  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.name) {
      setInviteError('Name and email are required');
      return;
    }
    setInviteError(undefined);
    setIsInviting(true);
    try {
      await usersApi.invite({
        email: inviteForm.email,
        name: inviteForm.name,
        role: inviteForm.role,
        phone: inviteForm.phone || undefined,
        department: inviteForm.department || undefined,
      });
      toast.success(`Invitation sent to ${inviteForm.email}`);
      setInviteOpen(false);
      setInviteForm(emptyInvite);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to send invitation');
    } finally {
      setIsInviting(false);
    }
  };

  const handleEditRole = async () => {
    if (!editingUser) return;
    setIsSavingRole(true);
    try {
      await usersApi.update(editingUser.id, { role: editRole } as never);
      toast.success('User role updated');
      setEditingUser(null);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to update user role');
    } finally {
      setIsSavingRole(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      if (user.isActive) {
        await usersApi.deactivate(user.id);
        toast.success('User deactivated');
      } else {
        await usersApi.activate(user.id);
        toast.success('User activated');
      }
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to update user status');
    }
  };

  const handleUnlock = async (user: User) => {
    try {
      await usersApi.unlock(user.id);
      toast.success('Account unlocked');
    } catch {
      toast.error('Failed to unlock account');
    }
  };

  const columns: DataTableColumn<User>[] = [
    {
      key: 'name',
      header: 'User',
      sortable: true,
      cell: (u) => (
        <div className="flex items-center gap-ds-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initialsOf(u.name, u.email)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-medium">{u.name ?? u.email}</p>
            <p className="text-xs text-ds-foreground-muted">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      cell: (u) => <Badge variant="secondary">{ROLE_LABELS[u.role] ?? u.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => (
        <Badge variant={u.isActive ? 'default' : 'outline'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      cell: (u) => formatDate((u as unknown as { lastLoginAt?: string }).lastLoginAt),
    },
  ];

  return (
    <>
      <ListPage<User>
        refreshKey={refreshKey}
        title="Team"
        description="Manage team members, roles, and access."
        getRowId={(u) => u.id}
        fetcher={({ page, limit, search }) => usersApi.list({ page, limit, search: search.trim() || undefined })}
        columns={columns}
        primaryAction={
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-ds-2">
            <Plus aria-hidden="true" /> Invite user
          </Button>
        }
        searchPlaceholder="Search by name or email…"
        rowActions={(u) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View login history"
              onClick={() => router.push(`/settings/login-history?userId=${u.id}`)}
            >
              <History aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit role"
              onClick={() => {
                setEditingUser(u);
                setEditRole((u.role as Role) ?? 'salesperson');
              }}
            >
              <Shield aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={u.isActive ? 'Deactivate' : 'Activate'}
              onClick={() => void handleToggleStatus(u)}
            >
              {u.isActive ? <UserX aria-hidden="true" /> : <UserCheck aria-hidden="true" />}
            </Button>
          </>
        )}
        renderDetail={(u) => (
          <div className="flex flex-col gap-ds-4 pt-ds-4">
            <div className="flex items-center gap-ds-3">
              <Avatar className="size-12">
                <AvatarFallback>{initialsOf(u.name, u.email)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{u.name ?? u.email}</p>
                <p className="text-sm text-ds-foreground-muted">{u.email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-ds-3 text-sm">
              <div>
                <dt className="text-ds-foreground-muted">Role</dt>
                <dd>{ROLE_LABELS[u.role] ?? u.role}</dd>
              </div>
              <div>
                <dt className="text-ds-foreground-muted">Status</dt>
                <dd>{u.isActive ? 'Active' : 'Inactive'}</dd>
              </div>
              <div>
                <dt className="text-ds-foreground-muted">Phone</dt>
                <dd>{u.phone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ds-foreground-muted">Department</dt>
                <dd>{u.department ?? '—'}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-ds-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingUser(u);
                  setEditRole((u.role as Role) ?? 'salesperson');
                }}
                className="gap-ds-2"
              >
                <Pencil aria-hidden="true" /> Edit role
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleUnlock(u)} className="gap-ds-2">
                <Lock aria-hidden="true" /> Unlock account
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/settings/login-history?userId=${u.id}`)}
                className="gap-ds-2"
              >
                <History aria-hidden="true" /> Login history
              </Button>
            </div>
          </div>
        )}
        detailTitle={(u) => u.name ?? u.email}
        emptyIcon={<Users aria-hidden="true" className="size-10" />}
        emptyTitle="No team members yet"
        emptyDescription="Invite your first teammate to get started."
        emptyAction={
          <Button size="sm" onClick={() => setInviteOpen(true)} className="gap-ds-2">
            <Plus aria-hidden="true" /> Invite user
          </Button>
        }
      />

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite team member</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4 py-ds-2">
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invite-name">
                Full name<span aria-hidden="true" className="ml-0.5 text-ds-danger">*</span>
              </Label>
              <Input
                id="invite-name"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Priya Sharma"
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invite-email">
                Email address<span aria-hidden="true" className="ml-0.5 text-ds-danger">*</span>
              </Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="colleague@company.com"
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invite-phone">Phone</Label>
              <PhoneInput
                value={inviteForm.phone}
                onChange={(v) => setInviteForm((p) => ({ ...p, phone: v }))}
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invite-department">Department</Label>
              <Input
                id="invite-department"
                value={inviteForm.department}
                onChange={(e) => setInviteForm((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g., Sales"
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invite-role">Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(v) => setInviteForm((p) => ({ ...p, role: v as Role }))}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError && (
              <p role="alert" className="text-sm text-ds-danger">
                {inviteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={isInviting} className="gap-ds-2">
              {isInviting ? <Spinner className="size-4" /> : <Mail aria-hidden="true" />}
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit role dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user role</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ds-foreground-muted">
            Changing role for <strong>{editingUser?.name ?? editingUser?.email}</strong>
          </p>
          <div className="flex flex-col gap-ds-4 py-ds-2">
            <div className="flex flex-col gap-ds-1">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditRole} disabled={isSavingRole} className="gap-ds-2">
              {isSavingRole && <Spinner className="size-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
