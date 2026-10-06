'use client';

import * as React from 'react';
import { Mail, MessageSquare, Link2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  SendMessageDialog,
  type MessageVariables,
} from '@/components/communication/send-message-dialog';

interface SharePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Used to build the default share link when `shareLink` is not given. */
  entityType?: string;
  entityId?: string;
  /** Link to share. Defaults to `/share/<entityType>/<entityId>` on this origin. */
  shareLink?: string;
  /** Who the message goes to. Without a contact, Email / WhatsApp are disabled. */
  contact?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  /** Template placeholder values (destination, dates, pax, amount). The share link is added automatically. */
  variables?: MessageVariables;
}

/**
 * Share dialog. Email and WhatsApp open the Communication Hub composer
 * (`SendMessageDialog`) so every message is templated, previewed and logged;
 * nothing is handed off to `mailto:` or `wa.me`.
 */
export function SharePanel({
  open,
  onOpenChange,
  title,
  entityType,
  entityId,
  shareLink: shareLinkProp,
  contact,
  variables,
}: SharePanelProps) {
  const [copied, setCopied] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<'email' | 'whatsapp' | null>(null);

  const shareLink =
    shareLinkProp ??
    (entityType && entityId
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${entityType}/${entityId}`
      : '');

  const messageVariables = React.useMemo<MessageVariables>(
    () => ({ ...variables, ...(shareLink ? { share_link: shareLink } : {}) }),
    [variables, shareLink],
  );

  const handleCopyLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link');
    }
  };

  const canEmail = !!contact?.email;
  const canWhatsApp = !!contact?.phone;

  return (
    <>
      <Dialog open={open && sendChannel === null} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share {title}</DialogTitle>
            <DialogDescription>
              Choose how you want to share this document
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-ds-4">
            <Card className="p-ds-4">
              <div className="space-y-ds-3">
                <div className="flex items-center gap-ds-2">
                  <Mail className="h-5 w-5 text-ds-primary" aria-hidden="true" />
                  <h4 className="font-semibold text-sm">Share via Email</h4>
                </div>
                <p className="text-xs text-ds-foreground-muted">
                  {contact
                    ? canEmail
                      ? `To ${contact.name} (${contact.email}) through the Communication Hub, with a template you can edit before sending.`
                      : `${contact.name} has no email address on file.`
                    : 'Link a contact to send this by email.'}
                </p>
                <Button size="sm" onClick={() => setSendChannel('email')} disabled={!canEmail}>
                  Send via Email
                </Button>
              </div>
            </Card>

            <Card className="p-ds-4">
              <div className="space-y-ds-3">
                <div className="flex items-center gap-ds-2">
                  <MessageSquare className="h-5 w-5 text-ds-primary" aria-hidden="true" />
                  <h4 className="font-semibold text-sm">Share via WhatsApp</h4>
                </div>
                <p className="text-xs text-ds-foreground-muted">
                  {contact
                    ? canWhatsApp
                      ? `To ${contact.name} (${contact.phone}) through the Communication Hub.`
                      : `${contact.name} has no phone number on file.`
                    : 'Link a contact to send this on WhatsApp.'}
                </p>
                <Button size="sm" onClick={() => setSendChannel('whatsapp')} disabled={!canWhatsApp}>
                  Send via WhatsApp
                </Button>
              </div>
            </Card>

            {shareLink && (
              <Card className="p-ds-4">
                <div className="space-y-ds-3">
                  <div className="flex items-center gap-ds-2">
                    <Link2 className="h-5 w-5 text-ds-primary" aria-hidden="true" />
                    <h4 className="font-semibold text-sm">Copy Shareable Link</h4>
                  </div>
                  <div className="rounded-md border border-ds-border bg-ds-surface-sunken p-ds-2 text-xs font-mono truncate text-ds-foreground-muted">
                    {shareLink}
                  </div>
                  <Button size="sm" variant="outline" onClick={handleCopyLink} className="w-full">
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
                        Copy Link
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-ds-foreground-muted">
                    Anyone with this link can view the document
                  </p>
                </div>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {contact && sendChannel && (
        <SendMessageDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setSendChannel(null);
              onOpenChange(false);
            }
          }}
          contact={contact}
          defaultChannel={sendChannel}
          variables={messageVariables}
        />
      )}
    </>
  );
}
