'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  Button, CurrencyInput, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, Textarea,
} from '@/components/ui';
import { creditNotesApi, debitNotesApi } from '@/lib/api/credit-notes';
import { toast } from 'sonner';

interface NoteItem {
  id: number;
  description: string;
  quantity: number;
  rate: number;
}

interface NoteDialogProps {
  kind: 'credit' | 'debit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  onCreated: () => void;
}

const COPY = {
  credit: {
    title: 'Issue Credit Note',
    submit: 'Create Credit Note',
    success: 'Credit note created',
    failure: 'Failed to create credit note',
    reasonPlaceholder: 'e.g., Service cancellation, Overcharge correction',
  },
  debit: {
    title: 'Issue Debit Note',
    submit: 'Create Debit Note',
    success: 'Debit note created',
    failure: 'Failed to create debit note',
    reasonPlaceholder: 'e.g., Additional charges, Price adjustment',
  },
} as const;

/** Credit / debit note form opened from an invoice. */
export function NoteDialog({ kind, open, onOpenChange, invoiceId, invoiceNumber, currency, onCreated }: NoteDialogProps) {
  const copy = COPY[kind];
  const idCounter = React.useRef(2);
  const [reason, setReason] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [items, setItems] = React.useState<NoteItem[]>([{ id: 1, description: '', quantity: 1, rate: 0 }]);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setReason('');
    setNotes('');
    setItems([{ id: 1, description: '', quantity: 1, rate: 0 }]);
    idCounter.current = 2;
  }

  function update(id: number, patch: Partial<NoteItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function submit() {
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    const filled = items.filter((item) => item.description.trim());
    if (filled.length === 0) {
      toast.error('At least one item with description is required');
      return;
    }
    if (filled.some((item) => !(item.rate > 0))) {
      toast.error('Each item needs a rate greater than 0');
      return;
    }
    setSaving(true);
    try {
      const request = {
        invoiceId,
        reason,
        notes: notes || undefined,
        items: filled.map(({ description, quantity, rate }) => ({ description, quantity, rate, taxRate: 18 })),
      };
      if (kind === 'credit') await creditNotesApi.create(request);
      else await debitNotesApi.create(request);
      toast.success(copy.success);
      onOpenChange(false);
      reset();
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : copy.failure);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            Create a {kind} note against invoice {invoiceNumber}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${kind}-note-reason`}>
              Reason <span className="text-ds-danger">*</span>
            </Label>
            <Input
              id={`${kind}-note-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.reasonPlaceholder}
            />
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label>Items</Label>
            {items.map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_4rem_7rem_2rem] items-center gap-ds-2">
                <Input
                  placeholder="Description"
                  aria-label="Description"
                  value={item.description}
                  onChange={(e) => update(item.id, { description: e.target.value })}
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  aria-label="Quantity"
                  value={item.quantity}
                  onChange={(e) => update(item.id, { quantity: parseInt(e.target.value, 10) || 1 })}
                />
                <CurrencyInput
                  value={item.rate || undefined}
                  onChange={(v) => update(item.id, { rate: v ?? 0 })}
                  currency={currency}
                  placeholder="Rate"
                  aria-label="Rate"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove item"
                  onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== item.id) : prev))}
                  className="text-ds-foreground-muted hover:text-ds-danger"
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setItems((prev) => [...prev, { id: idCounter.current++, description: '', quantity: 1, rate: 0 }])
              }
            >
              <Plus aria-hidden="true" />
              Add Item
            </Button>
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${kind}-note-notes`}>Notes (optional)</Label>
            <Textarea
              id={`${kind}-note-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
