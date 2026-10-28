'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import { Spinner } from './spinner';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** State the consequence plainly — especially for destructive actions. */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styles the confirm button as danger. */
  tone?: 'default' | 'destructive';
  /** May be async — the dialog shows a spinner and stays open until it settles. */
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const t = useT();
  const [pending, setPending] = React.useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={pending ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={pending}
            className={cn('gap-ds-2')}
          >
            {pending && <Spinner className="size-4" />}
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Imperative wrapper for one-off confirmations.
 *
 * const confirm = useConfirm();
 * if (await confirm({ title, description, tone: 'destructive' })) { ... }
 */
export function useConfirm() {
  const [state, setState] = React.useState<
    (Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'> & {
      resolve: (ok: boolean) => void;
    }) | null
  >(null);

  const confirm = React.useCallback(
    (opts: Omit<ConfirmDialogProps, 'open' | 'onOpenChange' | 'onConfirm'>) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    [],
  );

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      open
      onOpenChange={(open) => {
        if (!open) {
          state.resolve(false);
          setState(null);
        }
      }}
      onConfirm={() => {
        state.resolve(true);
        setState(null);
      }}
    />
  ) : null;

  return { confirm, dialog };
}
