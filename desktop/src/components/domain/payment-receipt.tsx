'use client';

import * as React from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatDisplayDate } from '@/lib/dates';
import { formatCurrency as formatMoney } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { paymentMethodLabel } from '@/lib/payment-methods';

interface PaymentReceiptProps {
  payment: {
    id: string;
    amount: number;
    paymentDate?: string;
    date?: string;
    paymentMethod?: string;
    method?: string;
    reference?: string;
    invoiceNumber?: string;
    invoiceId?: string;
    clientName?: string;
    recordedBy?: string;
  };
  companyName?: string;
  onClose: () => void;
}

function formatCurrency(amount: number, currency?: string | null) {
  return formatMoney(amount, currency || undefined);
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n: number): string {
    if (n < 20) return ones[n] ?? '';
    if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`.trim();
    if (n < 100000) return `${convert(Math.floor(n / 1000))} Thousand ${convert(n % 1000)}`.trim();
    if (n < 10000000) return `${convert(Math.floor(n / 100000))} Lakh ${convert(n % 100000)}`.trim();
    return `${convert(Math.floor(n / 10000000))} Crore ${convert(n % 10000000)}`.trim();
  }

  const wholePart = Math.floor(Math.abs(num));
  const decimalPart = Math.round((Math.abs(num) - wholePart) * 100);
  let result = convert(wholePart) + ' Rupees';
  if (decimalPart > 0) {
    result += ` and ${convert(decimalPart)} Paise`;
  }
  result += ' Only';
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Reads the active design-token colours so the printed receipt matches the app theme. */
function readPrintColours() {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    ink: token('--ds-foreground', 'currentColor'),
    muted: token('--ds-foreground-muted', 'currentColor'),
    border: token('--ds-border', 'currentColor'),
    accent: token('--ds-primary', 'currentColor'),
    success: token('--ds-success', 'currentColor'),
    sunken: token('--ds-surface-sunken', 'transparent'),
  };
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-ds-border py-ds-2 text-sm">
      <span className="text-ds-foreground-muted">{label}</span>
      <span className={mono ? 'font-medium font-mono' : 'font-medium'}>{value}</span>
    </div>
  );
}

export function PaymentReceipt({ payment, companyName, onClose }: PaymentReceiptProps) {
  const t = useT();
  const receiptRef = React.useRef<HTMLDivElement>(null);

  const formattedDate = formatDisplayDate(payment.paymentDate || payment.date, 'long')
    || formatDisplayDate(new Date(), 'long');

  const method = payment.paymentMethod || payment.method || 'N/A';
  const methodText = method === 'N/A' ? method : paymentMethodLabel(method, t);
  const receiptNumber = `REC-${payment.id.slice(0, 8).toUpperCase()}`;
  const company = companyName || 'TravelCRM';

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const c = readPrintColours();
    const row = (label: string, value: string, extra = '') =>
      `<div class="detail-row ${extra}"><span class="detail-label">${escapeHtml(label)}</span><span class="detail-value">${escapeHtml(value)}</span></div>`;

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Payment Receipt - ${escapeHtml(receiptNumber)}</title>
<style>
@page { size: A5; margin: 15mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Segoe UI', Arial, sans-serif; color: ${c.ink}; padding: 1.25rem; }
.receipt { max-width: 32rem; margin: 0 auto; border: 0.125rem solid ${c.border}; padding: 2rem; }
.header { text-align: center; border-bottom: 0.125rem solid ${c.accent}; padding-bottom: 1rem; margin-bottom: 1.25rem; }
.company-name { font-size: 1.25rem; font-weight: 700; color: ${c.accent}; }
.receipt-title { font-size: 1rem; font-weight: 600; margin-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.125rem; color: ${c.muted}; }
.receipt-meta { display: flex; justify-content: space-between; margin-bottom: 1.25rem; font-size: 0.8rem; color: ${c.muted}; }
.details { margin-bottom: 1.25rem; }
.detail-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 0.0625rem solid ${c.border}; font-size: 0.875rem; }
.detail-label { color: ${c.muted}; }
.detail-value { font-weight: 500; text-align: right; }
.amount-row { border-top: 0.125rem solid ${c.border}; border-bottom: 0.125rem solid ${c.border}; margin-top: 0.5rem; padding: 0.75rem 0; }
.amount-row .detail-value { font-size: 1.125rem; font-weight: 700; color: ${c.success}; }
.amount-words { font-size: 0.75rem; color: ${c.muted}; font-style: italic; margin-top: 0.5rem; text-align: center; padding: 0.5rem; background: ${c.sunken}; border-radius: 0.25rem; }
.footer { text-align: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 0.0625rem dashed ${c.border}; }
.thank-you { font-size: 0.95rem; font-weight: 600; color: ${c.accent}; }
.footer-note { font-size: 0.7rem; color: ${c.muted}; margin-top: 0.25rem; }
</style>
</head>
<body>
<div class="receipt">
<div class="header"><div class="company-name">${escapeHtml(company)}</div><div class="receipt-title">Payment Receipt</div></div>
<div class="receipt-meta"><span>Receipt #: ${escapeHtml(receiptNumber)}</span><span>Date: ${escapeHtml(formattedDate)}</span></div>
<div class="details">
${row('Received From', payment.clientName || 'N/A')}
${payment.invoiceNumber ? row('Invoice Reference', payment.invoiceNumber) : ''}
${row('Payment Method', methodText)}
${payment.reference ? row('Transaction Reference', payment.reference) : ''}
${row('Amount Received', formatCurrency(payment.amount ?? 0), 'amount-row')}
</div>
<div class="amount-words">${escapeHtml(numberToWords(payment.amount ?? 0))}</div>
<div class="footer"><div class="thank-you">Thank you for your payment!</div><div class="footer-note">This is a computer-generated receipt and does not require a signature.</div></div>
</div>
</body>
</html>`);

    printWindow.document.close();
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Payment Receipt Preview</DialogTitle>
          <DialogDescription className="sr-only">Printable receipt for this payment.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer aria-hidden="true" />
            Print / Save PDF
          </Button>
        </div>

        <div ref={receiptRef}>
          <div className="space-y-ds-5 rounded-ds-lg border-2 border-ds-border p-ds-6">
            <div className="border-b-2 border-ds-primary pb-ds-4 text-center">
              <p className="text-lg font-bold text-ds-primary">{company}</p>
              <p className="mt-ds-1 text-sm font-semibold uppercase tracking-widest text-ds-foreground-muted">Payment Receipt</p>
            </div>

            <div className="flex justify-between text-xs text-ds-foreground-muted">
              <span>Receipt #: {receiptNumber}</span>
              <span>Date: {formattedDate}</span>
            </div>

            <div>
              <Row label="Received From" value={payment.clientName || 'N/A'} />
              {payment.invoiceNumber && <Row label="Invoice Reference" value={payment.invoiceNumber} mono />}
              <Row label="Payment Method" value={methodText} />
              {payment.reference && <Row label="Transaction Reference" value={payment.reference} mono />}

              <div className="mt-ds-2 flex justify-between border-y-2 border-ds-border py-ds-3">
                <span className="font-semibold">Amount Received</span>
                <span className="text-lg font-bold text-ds-success">{formatCurrency(payment.amount ?? 0)}</span>
              </div>
            </div>

            <div className="rounded-ds-md bg-ds-surface-sunken py-ds-2 text-center text-xs italic text-ds-foreground-muted">
              {numberToWords(payment.amount ?? 0)}
            </div>

            <div className="border-t border-dashed border-ds-border pt-ds-4 text-center">
              <p className="text-sm font-semibold text-ds-primary">Thank you for your payment!</p>
              <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                This is a computer-generated receipt and does not require a signature.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
