'use client';

import * as React from 'react';
import { Check, Copy, LinkIcon, Send } from 'lucide-react';
import { Button, SectionCard, Tag, useConfirm } from '@/components/ui';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { invoicesApi, type InvoiceDetail } from '@/lib/api/invoices';
import { formatExactCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { PaymentLinkDialog } from './_components/payment-link-dialog';
import { toast } from 'sonner';

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  created: 'info',
  paid: 'success',
  expired: 'warning',
  cancelled: 'neutral',
};

const KNOWN_STATUS = new Set(['created', 'paid', 'expired', 'cancelled']);

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Pay-online section of an invoice: create a link (deposit, balance or custom amount) through the agency's own gateway, then
 * send it to the customer. Sending goes through the Communication Hub (SendMessageDialog); there is no mailto: or wa.me anywhere.
 */
export function PaymentLinkCard({ invoice, contact, onChanged }: {
  invoice: InvoiceDetail;
  contact: { name: string; email?: string | null; phone?: string | null };
  onChanged: () => void;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const link = invoice.paymentLink;
  const settled = invoice.balanceDue <= 0.01 || ['paid', 'void', 'cancelled'].includes(invoice.status);
  // Nothing to show on an invoice with no link that has nothing left to collect.
  if (settled && !link) return null;

  const live = link && link.status === 'created';
  // What the link collects; links made before R142 collected the balance.
  const linkAmount = link?.amount ?? invoice.balanceDue;
  const linkPurpose = link?.purpose ?? 'balance';

  const handleCancel = async () => {
    const ok = await confirm({
      title: t('payments.link.cancelTitle'),
      description: t('payments.link.cancelDescription'),
      confirmLabel: t('payments.link.cancel'),
      tone: 'destructive',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await invoicesApi.cancelPaymentLink(invoice.id);
      toast.success(t('payments.link.cancelled'));
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err, t('payments.link.cancelFailed')));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success(t('payments.link.dialog.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('payments.link.dialog.copyFailed'));
    }
  };

  const statusLabel = link ? (KNOWN_STATUS.has(link.status) ? t(`payments.link.status.${link.status}`) : link.status) : '';

  return (
    <SectionCard
      title={t('payments.link.cardTitle')}
      description={t('payments.link.cardDescription')}
      actions={
        settled ? undefined : (
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={busy} data-testid="invoice-payment-link-create">
            <LinkIcon aria-hidden="true" />
            {live ? t('payments.link.createNew') : t('payments.link.create')}
          </Button>
        )
      }
    >
      {dialog}
      <div className="flex flex-col gap-ds-3" data-testid="invoice-payment-link">
        {link ? (
          <>
            <div className="flex flex-wrap items-center gap-ds-2">
              <Tag tone={STATUS_TONE[link.status] ?? 'neutral'}>{statusLabel}</Tag>
              <span className="text-sm font-medium" data-testid="invoice-payment-link-amount">
                {t(`payments.link.purpose.${linkPurpose}`)}: {formatExactCurrency(linkAmount, invoice.currency)}
              </span>
              {link.gateway && <span className="text-xs capitalize text-ds-foreground-muted">{link.gateway === 'mock' ? t('payments.link.testGateway') : link.gateway}</span>}
            </div>
            <span className="truncate font-mono text-xs text-ds-foreground-muted" data-testid="invoice-payment-link-url">{link.url}</span>
            {live && (
              <div className="flex flex-wrap gap-ds-2">
                <Button size="sm" onClick={() => setSendOpen(true)} disabled={busy}>
                  <Send aria-hidden="true" />
                  {t('payments.link.send')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCopy} data-testid="invoice-payment-link-copy">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {t('payments.link.dialog.copy')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={busy}>{t('payments.link.cancel')}</Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-ds-foreground-muted">{t('payments.link.none')}</p>
        )}
      </div>

      <PaymentLinkDialog
        invoice={{ id: invoice.id, invoiceNumber: invoice.invoiceNumber, currency: invoice.currency, total: invoice.totalAmount, balanceDue: invoice.balanceDue }}
        open={createOpen}
        onOpenChange={(next) => {
          setCreateOpen(next);
          // The invoice page shows the new link once the dialog is closed.
          if (!next) onChanged();
        }}
        onCreated={() => undefined}
        onSend={() => {
          setCreateOpen(false);
          onChanged();
          setSendOpen(true);
        }}
      />

      {link && live && (
        <SendMessageDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          contact={{ id: invoice.contactId, name: contact.name, email: contact.email, phone: contact.phone }}
          leadId={invoice.leadId}
          variables={{
            payment_link: link.url,
            invoice_number: invoice.invoiceNumber,
            amount: formatExactCurrency(linkAmount, invoice.currency),
          }}
        />
      )}
    </SectionCard>
  );
}
