'use client';

import * as React from 'react';
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
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

export function PaymentReceipt({ payment, companyName, onClose }: PaymentReceiptProps) {
  const receiptRef = React.useRef<HTMLDivElement>(null);

  const dateStr = payment.paymentDate || payment.date;
  const formattedDate = dateStr
    ? new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const method = payment.paymentMethod || payment.method || 'N/A';
  const methodLabel: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    transfer: 'Bank Transfer',
    upi: 'UPI',
    cash: 'Cash',
    card: 'Card',
    cheque: 'Cheque',
    check: 'Cheque',
    other: 'Other',
  };

  const receiptNumber = `REC-${payment.id.slice(0, 8).toUpperCase()}`;

  const handlePrint = () => {
    const printContent = receiptRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Receipt - ${receiptNumber}</title>
        <style>
          @page { size: A5; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 20px; }
          .receipt { max-width: 500px; margin: 0 auto; border: 2px solid #e5e7eb; padding: 32px; }
          .header { text-align: center; border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 20px; }
          .company-name { font-size: 20px; font-weight: 700; color: #4f46e5; }
          .receipt-title { font-size: 16px; font-weight: 600; margin-top: 8px; text-transform: uppercase; letter-spacing: 2px; color: #6b7280; }
          .receipt-meta { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 13px; color: #6b7280; }
          .details { margin-bottom: 20px; }
          .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
          .detail-label { color: #6b7280; }
          .detail-value { font-weight: 500; text-align: right; }
          .amount-row { border-top: 2px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; margin-top: 8px; padding: 12px 0; }
          .amount-row .detail-value { font-size: 18px; font-weight: 700; color: #059669; }
          .amount-words { font-size: 12px; color: #6b7280; font-style: italic; margin-top: 8px; text-align: center; padding: 8px; background: #f9fafb; border-radius: 4px; }
          .footer { text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px dashed #d1d5db; }
          .thank-you { font-size: 15px; font-weight: 600; color: #4f46e5; }
          .footer-note { font-size: 11px; color: #9ca3af; margin-top: 4px; }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="header">
            <div class="company-name">${companyName || 'TravelCRM'}</div>
            <div class="receipt-title">Payment Receipt</div>
          </div>
          <div class="receipt-meta">
            <span>Receipt #: ${receiptNumber}</span>
            <span>Date: ${formattedDate}</span>
          </div>
          <div class="details">
            <div class="detail-row">
              <span class="detail-label">Received From</span>
              <span class="detail-value">${payment.clientName || 'N/A'}</span>
            </div>
            ${payment.invoiceNumber ? `<div class="detail-row">
              <span class="detail-label">Invoice Reference</span>
              <span class="detail-value">${payment.invoiceNumber}</span>
            </div>` : ''}
            <div class="detail-row">
              <span class="detail-label">Payment Method</span>
              <span class="detail-value">${methodLabel[method] ?? method}</span>
            </div>
            ${payment.reference ? `<div class="detail-row">
              <span class="detail-label">Transaction Reference</span>
              <span class="detail-value">${payment.reference}</span>
            </div>` : ''}
            ${payment.recordedBy ? `<div class="detail-row">
              <span class="detail-label">Recorded By</span>
              <span class="detail-value">${payment.recordedBy}</span>
            </div>` : ''}
            <div class="detail-row amount-row">
              <span class="detail-label" style="font-weight:600;font-size:15px">Amount Received</span>
              <span class="detail-value">${formatCurrency(payment.amount ?? 0)}</span>
            </div>
          </div>
          <div class="amount-words">${numberToWords(payment.amount ?? 0)}</div>
          <div class="footer">
            <div class="thank-you">Thank you for your payment!</div>
            <div class="footer-note">This is a computer-generated receipt and does not require a signature.</div>
          </div>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.addEventListener('load', () => {
      printWindow.print();
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Payment Receipt Preview</h3>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1.5" />
              Print / Save PDF
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Receipt Preview */}
        <div ref={receiptRef} className="p-6">
          <div className="border-2 border-border rounded-lg p-6 space-y-5">
            {/* Header */}
            <div className="text-center border-b-2 border-primary pb-4">
              <p className="text-lg font-bold text-primary">{companyName || 'TravelCRM'}</p>
              <p className="text-sm font-semibold mt-1 uppercase tracking-[3px] text-muted-foreground">Payment Receipt</p>
            </div>

            {/* Meta */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Receipt #: {receiptNumber}</span>
              <span>Date: {formattedDate}</span>
            </div>

            {/* Details */}
            <div className="space-y-0">
              <div className="flex justify-between py-2 border-b text-sm">
                <span className="text-muted-foreground">Received From</span>
                <span className="font-medium">{payment.clientName || 'N/A'}</span>
              </div>
              {payment.invoiceNumber && (
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Invoice Reference</span>
                  <span className="font-medium font-mono">{payment.invoiceNumber}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b text-sm">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium">{methodLabel[method] ?? method}</span>
              </div>
              {payment.reference && (
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Transaction Reference</span>
                  <span className="font-medium font-mono">{payment.reference}</span>
                </div>
              )}
              {payment.recordedBy && (
                <div className="flex justify-between py-2 border-b text-sm">
                  <span className="text-muted-foreground">Recorded By</span>
                  <span className="font-medium">{payment.recordedBy}</span>
                </div>
              )}

              {/* Amount */}
              <div className="flex justify-between py-3 border-y-2 mt-2">
                <span className="font-semibold">Amount Received</span>
                <span className="text-lg font-bold text-green-600">{formatCurrency(payment.amount ?? 0)}</span>
              </div>
            </div>

            {/* Amount in words */}
            <div className="text-xs text-muted-foreground italic text-center bg-muted/50 py-2 rounded">
              {numberToWords(payment.amount ?? 0)}
            </div>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-dashed">
              <p className="text-sm font-semibold text-primary">Thank you for your payment!</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                This is a computer-generated receipt and does not require a signature.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
