'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MoreHorizontal, Eye, Ban, RotateCcw, Trash2 } from 'lucide-react';

interface TenantActionsProps {
  tenant: {
    id: string;
    company_name: string;
    status: string;
  };
  onRefresh: () => void;
}

export function TenantActions({ tenant, onRefresh }: TenantActionsProps) {
  const router = useRouter();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSuspend = async () => {
    setLoading(true);
    await fetch(`/api/tenants/${tenant.id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setLoading(false);
    setSuspendOpen(false);
    setReason('');
    onRefresh();
  };

  const handleReactivate = async () => {
    await fetch(`/api/tenants/${tenant.id}/reactivate`, { method: 'POST' });
    onRefresh();
  };

  const handleDelete = async () => {
    if (confirmName !== tenant.company_name) return;
    setLoading(true);
    await fetch(`/api/tenants/${tenant.id}`, { method: 'DELETE' });
    setLoading(false);
    setDeleteOpen(false);
    onRefresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/tenants/${tenant.id}`)}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {tenant.status !== 'suspended' ? (
            <DropdownMenuItem onClick={() => setSuspendOpen(true)} className="text-orange-600">
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleReactivate} className="text-green-600">
              <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Suspend Dialog */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Tenant</DialogTitle>
            <DialogDescription>
              Suspend &quot;{tenant.company_name}&quot;? They will not be able to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for suspension" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={loading || !reason}>
              {loading ? 'Suspending...' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Tenant</DialogTitle>
            <DialogDescription>
              This will soft-delete &quot;{tenant.company_name}&quot;. Type the company name to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Type &quot;{tenant.company_name}&quot; to confirm</label>
            <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || confirmName !== tenant.company_name}
            >
              {loading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
