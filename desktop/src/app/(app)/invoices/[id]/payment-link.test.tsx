import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const createPaymentLink = vi.fn();
vi.mock('@/lib/api/invoices', () => ({
  invoicesApi: { createPaymentLink: (...a: unknown[]) => createPaymentLink(...a), cancelPaymentLink: vi.fn() },
}));

// The dialog is the Communication Hub entry point: the test only checks that the link is handed to it.
const dialogProps = vi.fn();
vi.mock('@/components/communication/send-message-dialog', () => ({
  SendMessageDialog: (props: Record<string, unknown>) => {
    dialogProps(props);
    return props.open ? <div role="dialog" aria-label="Send message" /> : null;
  },
}));

import { PaymentLinkCard } from './_payment-link';
import type { InvoiceDetail } from '@/lib/api/invoices';

function invoice(overrides: Partial<InvoiceDetail> = {}): InvoiceDetail {
  return {
    id: 'inv1', invoiceNumber: 'INV-1', status: 'sent', currency: 'INR', contactId: 'c1', leadId: null, balanceDue: 1500, paymentLink: null,
    ...overrides,
  } as InvoiceDetail;
}

const contact = { name: 'Asha', email: 'asha@example.test', phone: '+919000000001' };

describe('PaymentLinkCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a link for an unpaid invoice', async () => {
    createPaymentLink.mockResolvedValue({ data: {} });
    const onChanged = vi.fn();
    render(<PaymentLinkCard invoice={invoice()} contact={contact} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /create payment link/i }));
    await waitFor(() => expect(createPaymentLink).toHaveBeenCalledWith('inv1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('points to Settings > Integrations when no gateway is connected', async () => {
    createPaymentLink.mockRejectedValue(new Error('Connect Razorpay or Stripe in Settings > Integrations to create payment links'));
    render(<PaymentLinkCard invoice={invoice()} contact={contact} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /create payment link/i }));
    const link = await screen.findByRole('link', { name: /connect razorpay or stripe/i });
    expect(link.getAttribute('href')).toBe('/settings/integrations');
  });

  it('sends an existing link only through the Communication Hub dialog, with the link as a template variable', () => {
    const withLink = invoice({ paymentLink: { id: 'plink_1', url: 'https://rzp.io/i/abc', status: 'created', gateway: 'razorpay' } });
    const { container } = render(<PaymentLinkCard invoice={withLink} contact={contact} onChanged={vi.fn()} />);
    expect(container.querySelector('a[href^="mailto:"], a[href*="wa.me"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /send payment link/i }));
    expect(screen.getByRole('dialog', { name: 'Send message' })).toBeTruthy();
    const last = dialogProps.mock.calls.at(-1)?.[0] as { variables: Record<string, string>; contact: { id: string } };
    expect(last.contact.id).toBe('c1');
    expect(last.variables.payment_link).toBe('https://rzp.io/i/abc');
    expect(last.variables.invoice_number).toBe('INV-1');
  });

  it('offers nothing on a settled invoice that never had a link', () => {
    const { container } = render(<PaymentLinkCard invoice={invoice({ balanceDue: 0, status: 'paid' })} contact={contact} onChanged={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
