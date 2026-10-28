'use client';

import * as React from 'react';
import { RelationCombobox } from '@/components/domain';
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { usersApi } from '@/lib/api/users';
import type { User } from '@travelcrm/shared';
import { toast } from 'sonner';

/** Picks a team member and bulk-assigns the given leads to them. */
export function LeadAssignDialog({
  open,
  onOpenChange,
  leadIds,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  onAssigned: () => void;
}) {
  const [userId, setUserId] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);

  React.useEffect(() => {
    if (open) setUserId(null);
  }, [open]);

  async function handleAssign() {
    if (!userId || leadIds.length === 0) return;
    setAssigning(true);
    try {
      await leadsApi.bulkAssign({ leadIds, assignedTo: userId });
      toast.success(`${leadIds.length} lead(s) assigned`);
      onOpenChange(false);
      onAssigned();
    } catch {
      toast.error('Failed to assign leads');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {leadIds.length} Lead(s)</DialogTitle>
          <DialogDescription>Select a team member to take ownership.</DialogDescription>
        </DialogHeader>
        <RelationCombobox<User>
          value={userId}
          onChange={(id) => setUserId(id)}
          fetcher={async (q, page) => {
            const r = await usersApi.list({ search: q, page, limit: 20 });
            return { items: r.data, total: r.pagination.total };
          }}
          getOptionId={(u) => u.id}
          getOptionLabel={(u) => u.name || u.email}
          getOptionDescription={(u) => u.email}
          placeholder="Select team member"
          searchPlaceholder="Search team..."
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assigning}>Cancel</Button>
          <Button onClick={handleAssign} disabled={assigning || !userId}>Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
