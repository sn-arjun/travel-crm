'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useApiQuery } from '@/hooks/use-api';
import { ERASE_CONFIRMATION_PHRASE, contactsApi } from '@/lib/api/contacts';
import { formatDisplayDate } from '@/lib/dates';
import { useAuthStore } from '@/stores/auth-store';

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', whatsapp: 'WhatsApp', sms: 'SMS', call: 'Calls', any: 'All channels' };
const SOURCE_LABEL: Record<string, string> = {
  form: 'Form',
  import: 'Import',
  manual: 'Recorded by staff',
  unsubscribe_link: 'Unsubscribe link',
  chatbot: 'Chatbot',
};

/**
 * Privacy section of the contact page: consent history for everyone who can see the contact, and (admins only)
 * export of everything held about the contact and erasure of their personal data.
 */
export function PrivacySection({ contactId, contactName }: { contactId: string; contactName: string }) {
  const router = useRouter();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { confirm, dialog } = useConfirm();
  const consents = useApiQuery(() => contactsApi.getConsents(contactId), [contactId]);
  const [busy, setBusy] = React.useState<'export' | 'erase' | null>(null);
  const [eraseOpen, setEraseOpen] = React.useState(false);
  const [typed, setTyped] = React.useState('');

  const history = consents.data?.data?.history ?? [];

  async function handleExport() {
    setBusy('export');
    try {
      const res = await contactsApi.privacyExport(contactId);
      const blob = await contactsApi.downloadExport(res.data.downloadPath);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contact-data-${contactId.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Data export downloaded');
    } catch {
      toast.error('Could not export this contact\'s data');
    } finally {
      setBusy(null);
    }
  }

  async function handleErase() {
    const ok = await confirm({
      title: `Erase ${contactName}?`,
      description:
        'Their messages, calls, documents, files and travel records are deleted for good. Invoices and payments stay for tax records with the name removed. This cannot be undone.',
      confirmLabel: 'Erase contact',
      tone: 'destructive',
    });
    if (!ok) return;
    setBusy('erase');
    try {
      await contactsApi.erase(contactId, typed.trim());
      toast.success('Contact erased');
      router.push('/contacts');
    } catch {
      toast.error('Could not erase this contact');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard title="Privacy and consent">
      <div className="flex flex-col gap-ds-4" data-testid="contact-privacy">
        <div>
          <h3 className="mb-ds-2 text-sm font-medium text-ds-foreground">Consent history</h3>
          {consents.loading ? (
            <Skeleton className="h-12 w-full" />
          ) : history.length === 0 ? (
            <p className="text-sm text-ds-foreground-muted" data-testid="consent-empty">No consent has been recorded for this contact yet.</p>
          ) : (
            <ul className="flex flex-col gap-ds-2" data-testid="consent-history">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-ds-2 text-sm">
                  <Tag tone={h.status === 'granted' ? 'success' : 'neutral'} className="capitalize">{h.status}</Tag>
                  <span className="capitalize">{h.purpose}</span>
                  <span className="text-ds-foreground-muted">
                    {CHANNEL_LABEL[h.channel] ?? h.channel} - {SOURCE_LABEL[h.source] ?? h.source}
                    {h.capturedByName ? ` (${h.capturedByName})` : ''} - {formatDisplayDate(h.capturedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-ds-3 border-t border-ds-border pt-ds-4">
            <div className="flex flex-wrap gap-ds-2">
              <Button variant="outline" size="sm" onClick={() => void handleExport()} disabled={busy !== null} data-testid="privacy-export">
                {busy === 'export' ? 'Preparing...' : 'Export data'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEraseOpen((v) => !v)} disabled={busy !== null} data-testid="privacy-erase-toggle">
                Erase contact
              </Button>
            </div>
            {eraseOpen && (
              <div className="flex flex-col gap-ds-2" data-testid="privacy-erase-form">
                <Label htmlFor="erase-phrase">Type {ERASE_CONFIRMATION_PHRASE} to confirm</Label>
                <Input id="erase-phrase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                <div>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busy !== null || typed.trim() !== ERASE_CONFIRMATION_PHRASE}
                    onClick={() => void handleErase()}
                    data-testid="privacy-erase-confirm"
                  >
                    {busy === 'erase' ? 'Erasing...' : 'Erase personal data'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {dialog}
    </SectionCard>
  );
}
