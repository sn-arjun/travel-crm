'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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

const lostReasons = [
  {
    id: 'budget_issues' as const,
    label: 'Budget Issues',
    description: 'Client couldn\'t afford the package',
    icon: '💰',
  },
  {
    id: 'chose_competitor' as const,
    label: 'Chose Competitor',
    description: 'Client went with another travel company',
    icon: '🏆',
  },
  {
    id: 'changed_plans' as const,
    label: 'Changed Plans',
    description: 'Client decided not to travel',
    icon: '📅',
  },
  {
    id: 'no_response' as const,
    label: 'No Response',
    description: 'Client stopped responding',
    icon: '📞',
  },
  {
    id: 'poor_timing' as const,
    label: 'Poor Timing',
    description: 'Timing wasn\'t right for the client',
    icon: '⏰',
  },
  {
    id: 'other' as const,
    label: 'Other',
    description: 'Different reason',
    icon: '❓',
  },
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

  const handleConfirm = () => {
    if (!selectedReason) {
      alert('Please select a reason');
      return;
    }
    onConfirm(selectedReason, notes);
    // Reset form
    setSelectedReason(null);
    setNotes('');
  };

  const handleCancel = () => {
    // Reset form
    setSelectedReason(null);
    setNotes('');
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark Lead as Lost
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            You\'re marking
            {' '}
            <span className="font-semibold">{leadName}</span>
            {' '}
            as lost. Please provide a reason.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Reason Selection */}
          <div>
            <label className="block text-sm font-semibold mb-3">Why is this lead lost?</label>
            <div className="space-y-2">
              {lostReasons.map((reason: any) => (
                <button
                  key={reason.id}
                  onClick={() => setSelectedReason(reason.id)}
                  disabled={isLoading}
                  className={cn(
                    'w-full text-left p-3 rounded-lg border-2 transition-all',
                    selectedReason === reason.id
                      ? 'border-primary bg-primary/5'
                      : 'border-input hover:border-muted-foreground/50',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg shrink-0">{reason.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{reason.label}</p>
                      <p className="text-xs text-muted-foreground">{reason.description}</p>
                    </div>
                    {selectedReason === reason.id && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                        <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-sm font-semibold mb-2">Additional Notes (Optional)</label>
            <textarea
              placeholder="Add any additional context about why this lead was lost..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isLoading}
              className="w-full h-24 rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">{notes.length} characters</p>
          </div>

          {/* Warning */}
          <Card className="border-destructive/50 bg-destructive/5">
            <div className="p-3">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                This action cannot be undone
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The lead will be moved to lost status and will no longer appear in active pipelines.
              </p>
            </div>
          </Card>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !selectedReason}
          >
            {isLoading ? 'Marking as Lost...' : 'Mark as Lost'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
