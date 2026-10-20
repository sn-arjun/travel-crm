
import { formatPdfMoney } from '@/lib/format';
import type { InvoiceDetail } from '@/lib/api/invoices';
import { formatDisplayDate } from '@/lib/dates';

/** The standard PDF fonts only hold Latin-1 glyphs, so a currency whose symbol is outside it is written as its code. */
function pdfMoney(amount: number, currency: string): string {
  return formatPdfMoney(amount, currency);
}

export async function buildInvoicePdf(inv: InvoiceDetail) {
  const { default: JsPdf } = await import('jspdf');
  const doc = new JsPdf();
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 14, 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(inv.invoiceNumber, 14, 30);

  doc.setFontSize(9);
  doc.text(`Status: ${inv.status.replace('_', ' ').toUpperCase()}`, pageW - 14, 22, { align: 'right' });
  doc.text(`Issue: ${formatDisplayDate(inv.issueDate) || '-'}`, pageW - 14, 28, { align: 'right' });
  doc.text(`Due: ${formatDisplayDate(inv.dueDate) || '-'}`, pageW - 14, 34, { align: 'right' });

  doc.setDrawColor(200);
  doc.line(14, 38, pageW - 14, 38);

  let y = 46;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(inv.contactName || 'N/A', 14, y + 6);
  if (inv.contactEmail) doc.text(inv.contactEmail, 14, y + 12);
  const idLabel = inv.taxRegime === 'gst' ? 'GSTIN' : inv.taxRegime === 'vat' ? 'VAT no.' : 'Tax ID';
  if (inv.buyerTaxId) doc.text(`${idLabel}: ${inv.buyerTaxId}`, 14, y + 18);
  if (inv.sellerTaxId) doc.text(`Our ${idLabel}: ${inv.sellerTaxId}`, pageW - 14, y + 6, { align: 'right' });
  if (inv.placeOfSupply) doc.text(`Place of supply: ${inv.placeOfSupply}`, pageW - 14, y + 12, { align: 'right' });

  y = 70;
  if (inv.items.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Description', 14, y);
    doc.text('Qty', 110, y);
    doc.text('Rate', 130, y);
    doc.text('Amount', pageW - 14, y, { align: 'right' });
    doc.line(14, y + 2, pageW - 14, y + 2);
    y += 8;
    doc.setFont('helvetica', 'normal');
    for (const item of inv.items) {
      doc.text(item.description, 14, y);
      doc.text(String(item.quantity), 110, y);
      doc.text(pdfMoney(item.rate, inv.currency), 130, y);
      doc.text(pdfMoney(item.amount, inv.currency), pageW - 14, y, { align: 'right' });
      y += 7;
    }
  }

  y += 5;
  doc.line(110, y, pageW - 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Subtotal:', 130, y);
  doc.text(pdfMoney(inv.subtotal, inv.currency), pageW - 14, y, { align: 'right' });
  if (inv.discountAmount > 0) {
    y += 6;
    doc.text('Discount:', 130, y);
    doc.text(`-${pdfMoney(inv.discountAmount, inv.currency)}`, pageW - 14, y, { align: 'right' });
  }
  // Tax lines come from the breakdown stored on the invoice, so every regime prints its own labels
  for (const line of inv.taxBreakdown) {
    y += 6;
    doc.text(`${line.label} (${line.rate}%):`, 130, y);
    doc.text(pdfMoney(line.amount, inv.currency), pageW - 14, y, { align: 'right' });
  }
  if (inv.taxBreakdown.length === 0 && inv.totalTax > 0) {
    y += 6;
    doc.text('Tax:', 130, y);
    doc.text(pdfMoney(inv.totalTax, inv.currency), pageW - 14, y, { align: 'right' });
  }
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total:', 130, y);
  doc.text(pdfMoney(inv.totalAmount, inv.currency), pageW - 14, y, { align: 'right' });

  if (inv.paidAmount > 0) {
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Paid:', 130, y);
    doc.text(pdfMoney(inv.paidAmount, inv.currency), pageW - 14, y, { align: 'right' });
    y += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('Balance Due:', 130, y);
    doc.text(pdfMoney(inv.balanceDue, inv.currency), pageW - 14, y, { align: 'right' });
  }

  // Regime wording stored on the invoice, such as the export (LUT) or reverse charge statement
  for (const note of inv.taxNotes) {
    y += 10;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text(note, 14, y, { maxWidth: pageW - 28 });
  }

  if (inv.notes) {
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notes:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.notes, 14, y + 6, { maxWidth: pageW - 28 });
  }

  return doc;
}

export function downloadInvoiceCsv(inv: InvoiceDetail) {
  const rows: string[][] = [['Description', 'Quantity', 'Rate', 'Amount']];
  for (const item of inv.items) {
    rows.push([item.description, String(item.quantity), String(item.rate), String(item.amount)]);
  }
  rows.push([]);
  for (const line of inv.taxBreakdown) rows.push(['', '', `${line.label} (${line.rate}%)`, String(line.amount)]);
  rows.push(['', '', 'Total', String(inv.totalAmount)]);
  rows.push(['', '', 'Paid', String(inv.paidAmount)]);
  rows.push(['', '', 'Balance', String(inv.balanceDue)]);

  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
  const header = `Invoice: ${inv.invoiceNumber}\nDate: ${formatDisplayDate(inv.issueDate)}\nClient: ${inv.contactName}\n\n`;
  const blob = new Blob([header + csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${inv.invoiceNumber || 'invoice'}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
