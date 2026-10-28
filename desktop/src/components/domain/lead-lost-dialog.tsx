'use client';

import * as React from 'react';
import {
  AlertTriangle, Wallet, Trophy, CalendarX, PhoneOff, Clock, HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type LostReason =
  | 'budget_issues'
  | 'chose_competitor'
  | 'changed_plans'
  | 'no_response'
  | 'poor_timing'
  | 'other';

interface LeadLostDialogProps {
  isOpen: boolean;
  leadName: string;
  onConfirm: (reason: LostReason, notes: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

interface LostReasonOption {
  id: LostReason;
  label: string;
  description: string;
  icon: LucideIcon;
}

const lostReasons: LostReasonOption[] = [
  { id: 'budget_issues', label: 'Budget Issues', description: "Client couldn't afford the package", icon: Wallet },
  { id: 'chose_competitor', label: 'Chose Competitor', description: 'Client went with another travel company', icon: Trophy },
  { id: 'changed_plans', label: 'Changed Plans', description: 'Client decided not to travel', icon: CalendarX },
  { id: 'no_response', label: 'No Response', description: 'Client stopped responding', icon: PhoneOff },
  { id: 'poor_timing', label: 'Poor Timing', description: "Timing wasn't right for the client", icon: Clock },
  { id: 'other', label: 'Other', description: 'Different reason', icon: HelpCircle },
];

export function LeadLostDialog({
  isOpen,
  leadName,
  onConfirm,
  onCancel,
  isLoading = false,
}: LeadLostDialogProps) {
  const [selectedReason, setSelectedReason] = React.useState<LostReason | null>(null);
  const [notes, setNotes] = React.useState('');
  const [showReasonError, setShowReasonError] = React.useState(false);

  const reset = () => {
    setSelectedReason(null);
    setNotes('');
    setShowReasonError(false);
  };

  const handleConfirm = () => {
    if (!selectedReason) {
      setShowReasonError(true);
      return;
    }
    onConfirm(selectedReason, notes);
    reset();
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-ds-danger" aria-hidden="true" />
            Mark Lead as Lost
          </DialogTitle>
          <p className="mt-2 text-sm text-ds-foreground-muted">
            You&apos;re marking <span className="font-semibold text-ds-foreground">{leadName}</span> as lost. Please provide a reason.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          <fieldset>
            <legend className="mb-3 block text-sm font-semibold">Why is this lead lost? <span className="text-ds-danger">*</span></legend>
            <div className="space-y-2">
              {lostReasons.map((reason) => {
                const Icon = reason.icon;
                const selected = selectedReason === reason.id;
                return (
                  <button
                    key={reason.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { setSelectedReason(reason.id); setShowReasonError(false); }}
                    disabled={isLoading}
                    className={cn(
                      'w-full rounded-ds-lg border-2 p-3 text-start transition-all',
                      selected
                        ? 'border-ds-primary bg-ds-primary-subtle'
                        : 'border-ds-border hover:border-ds-border-strong',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 size-5 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{reason.label}</p>
                        <p className="text-xs text-ds-foreground-muted">{reason.description}</p>
                      </div>
                      {selected && (
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ds-primary">
                          <div className="size-2 rounded-full bg-ds-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {showReasonError && (
              <p role="alert" className="mt-2 text-xs text-ds-danger">Select a reason to continue.</p>
            )}
          </fieldset>

          <div>
            <label htmlFor="lead-lost-notes" className="mb-2 block text-sm font-semibold">Additional Notes (Optional)</label>
            <textarea
              id="lead-lost-notes"
              placeholder="Add any additional context about why this lead was lost..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoading}
              className="h-24 w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 py-2 text-sm placeholder:text-ds-foreground-subtle focus:outline-none focus:ring-2 focus:ring-ds-ring disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-ds-foreground-muted">{notes.length} characters</p>
          </div>

          <Card className="border-ds-danger bg-ds-danger-subtle">
            <div className="p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ds-danger-on-subtle">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                This action cannot be undone
              </p>
              <p className="mt-1 text-xs text-ds-foreground-muted">
                The lead will be moved to lost status and will no longer appear in active pipelines.
              </p>
            </div>
          </Card>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? 'Marking as Lost...' : 'Mark as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
