'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { SendMessageDialog, type MessageVariables } from '@/components/communication/send-message-dialog';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-selected recipient; skips the picker step. */
  contact?: Pick<Contact, 'id' | 'name' | 'email' | 'phone'>;
  defaultChannel?: 'email' | 'whatsapp' | 'sms';
  variables?: MessageVariables;
}

/**
 * Compose entry point: pick a recipient, then write and send through the
 * Communication Hub (SendMessageDialog) - template picker, preview and
 * placeholder checks included.
 */
export function ComposeModal({ isOpen, onClose, contact, defaultChannel, variables }: ComposeModalProps) {
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Contact | null>(null);
  const [sending, setSending] = React.useState(false);

  const recipient = contact ?? picked;

  const reset = () => {
    setContactId(null);
    setPicked(null);
    setSending(false);
  };

  if (recipient && sending) {
    return (
      <SendMessageDialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            reset();
            onClose();
          }
        }}
        contact={{ id: recipient.id, name: recipient.name, email: recipient.email, phone: recipient.phone }}
        defaultChannel={defaultChannel}
        variables={variables}
      />
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compose message</DialogTitle>
          <DialogDescription>Choose who the message is for.</DialogDescription>
        </DialogHeader>
        <RelationCombobox<Contact>
          value={contact?.id ?? contactId}
          onChange={(id, item) => {
            setContactId(id);
            setPicked(item ?? null);
          }}
          fetcher={async (q, page) => {
            const r = await contactsApi.list({ search: q, page, limit: 20 });
            const items = r.data?.data ?? [];
            return { items, total: r.data?.pagination?.total ?? items.length };
          }}
          getOptionId={(c) => c.id}
          getOptionLabel={(c) => c.name}
          getOptionDescription={(c) => c.email ?? undefined}
          resolveSelected={async (id) => (await contactsApi.getById(id)).data}
          placeholder="Search contacts…"
          searchPlaceholder="Search contacts…"
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={() => setSending(true)} disabled={!recipient}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
