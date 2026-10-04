'use client';

import * as React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tag } from '@/components/ui/tag';
import { formatDisplayDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  createdAt: string;
}

export interface DuplicateContactPair {
  original: Contact;
  potential: Contact;
  matchScore: number;
  matchingFields: ('name' | 'email' | 'phone')[];
}

interface DuplicateDetectionDialogProps {
  isOpen: boolean;
  duplicates: DuplicateContactPair[];
  onMerge: (original: Contact, duplicate: Contact) => void;
  onKeepBoth: (contact: Contact) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-ds-foreground-muted">{label}</p>
      <p className={cn('text-sm', mono && 'font-mono')}>{value || '—'}</p>
    </div>
  );
}

function ContactPanel({ title, tone, contact }: { title: string; tone: 'success' | 'danger'; contact: Contact }) {
  return (
    <section
      className={cn(
        'flex flex-col gap-ds-2 rounded-ds-lg border p-ds-4',
        tone === 'success' ? 'border-ds-success bg-ds-success-subtle' : 'border-ds-danger bg-ds-danger-subtle',
      )}
    >
      <h4 className="flex items-center gap-ds-2 text-sm font-semibold">
        <span className={cn('size-2 rounded-full', tone === 'success' ? 'bg-ds-success' : 'bg-ds-danger')} aria-hidden="true" />
        {title}
      </h4>
      <Field label="Name" value={contact.name} />
      <Field label="Email" value={contact.email} mono />
      <Field label="Phone" value={contact.phone} mono />
      {contact.company && <Field label="Company" value={contact.company} />}
      <Field label="Added" value={formatDisplayDate(new Date(contact.createdAt))} />
    </section>
  );
}

export function DuplicateDetectionDialog({
  isOpen,
  duplicates,
  onMerge,
  onKeepBoth,
  onSkip,
  isLoading = false,
}: DuplicateDetectionDialogProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);

  const current = duplicates[currentIndex];

  const mergePreview = React.useMemo<Contact | null>(
    () =>
      current
        ? {
            ...current.original,
            email: current.original.email || current.potential.email,
            phone: current.original.phone || current.potential.phone,
            company: current.original.company || current.potential.company,
          }
        : null,
    [current],
  );

  const advance = () => {
    if (currentIndex < duplicates.length - 1) setCurrentIndex(currentIndex + 1);
  };

  if (!current) return null;

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-ds-2">
            <AlertCircle className="size-5 text-ds-warning" aria-hidden="true" />
            Duplicate Contact Detected
          </DialogTitle>
          <DialogDescription>
            Contact {currentIndex + 1} of {duplicates.length}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-ds-6">
          <div>
            <div className="mb-ds-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Match score</h3>
              <span className="text-2xl font-semibold text-ds-warning-on-subtle">{current.matchScore}%</span>
            </div>
            <progress
              value={current.matchScore}
              max={100}
              aria-label="Match score"
              className="h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-ds-warning [&::-webkit-progress-bar]:bg-ds-surface-sunken [&::-webkit-progress-value]:bg-ds-warning"
            />
          </div>

          <div>
            <h3 className="mb-ds-3 text-sm font-semibold">Matching criteria</h3>
            <div className="flex flex-wrap gap-ds-2">
              {current.matchingFields.map((field) => (
                <Tag key={field} tone="success">
                  <Check className="size-3.5" aria-hidden="true" />
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Tag>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="mb-ds-3 text-sm font-semibold">Review details</h3>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <ContactPanel title="Current contact (keep)" tone="success" contact={current.original} />
              <ContactPanel title="Potential duplicate" tone="danger" contact={current.potential} />
            </div>
          </div>

          {mergePreview && (
            <>
              <Separator />
              <div>
                <h3 className="mb-ds-3 text-sm font-semibold">Merge preview</h3>
                <div className="flex flex-col gap-ds-2 rounded-ds-lg border border-ds-info bg-ds-info-subtle p-ds-4">
                  <Field label="Merged name" value={mergePreview.name} />
                  <Field label="Merged email" value={mergePreview.email} mono />
                  <Field label="Merged phone" value={mergePreview.phone} mono />
                  {mergePreview.company && <Field label="Merged company" value={mergePreview.company} />}
                </div>
                <p className="mt-ds-2 text-xs text-ds-foreground-muted">
                  Fields from the current contact are preserved. Missing data from the duplicate is filled in.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-ds-border pt-ds-4 sm:justify-between">
          <Button variant="outline" onClick={onSkip} disabled={isLoading}>
            <X aria-hidden="true" />
            Skip
          </Button>
          <div className="flex items-center gap-ds-2">
            <Button
              variant="outline"
              onClick={() => {
                onKeepBoth(current.potential);
                advance();
              }}
              disabled={isLoading}
            >
              Keep Both
            </Button>
            <Button
              onClick={() => {
                onMerge(current.original, current.potential);
                advance();
              }}
              disabled={isLoading}
            >
              Merge Contacts
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
