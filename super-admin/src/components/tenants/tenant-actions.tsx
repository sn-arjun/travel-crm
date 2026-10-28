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
import { MoreHorizontal, Eye, Ban, RotateCcw } from 'lucide-react';

interface TenantActionsProps {
  tenant: {
    id: string;
    name: string;
    status: string;
  };
  onRefresh: () => void;
}

export function TenantActions({ tenant, onRefresh }: TenantActionsProps) {
  const router = useRouter();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuspend = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tenants/${tenant.id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error || 'Could not suspend the agency');
      return;
    }
    setSuspendOpen(false);
    setReason('');
    onRefresh();
  };

  const handleReactivate = async () => {
    await fetch(`/api/tenants/${tenant.id}/reactivate`, { method: 'POST' });
    onRefresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${tenant.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/tenants/${tenant.id}`)}>
            <Eye className="mr-2 h-4 w-4" /> View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {tenant.status === 'active' && (
            <DropdownMenuItem onClick={() => setSuspendOpen(true)} className="text-orange-600">
              <Ban className="mr-2 h-4 w-4" /> Suspend
            </DropdownMenuItem>
          )}
          {tenant.status !== 'active' && (
            <DropdownMenuItem onClick={handleReactivate} className="text-green-600">
              <RotateCcw className="mr-2 h-4 w-4" /> Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Tenant</DialogTitle>
            <DialogDescription>
              Suspend &quot;{tenant.name}&quot;? They will not be able to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for suspension" />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleSuspend} disabled={loading || !reason}>
              {loading ? 'Suspending...' : 'Suspend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
