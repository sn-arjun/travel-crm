import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./client', () => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { client } from './client';
import { invoicesApi, normalizeInvoiceDetail } from './invoices';

describe('invoicesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /invoices with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      const result = await invoicesApi.list();

      expect(client.get).toHaveBeenCalledWith('/invoices', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await invoicesApi.list({ page: 2, limit: 15 });

      expect(client.get).toHaveBeenCalledWith('/invoices', { params: { page: 2, limit: 15 } });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await invoicesApi.list({ status: 'paid', leadId: 'l1', contactId: 'c1' });

      expect(client.get).toHaveBeenCalledWith('/invoices', { params: { status: 'paid', leadId: 'l1', contactId: 'c1' } });
    });

    it('should pass search and sort params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await invoicesApi.list({ search: 'INV-001', sortBy: 'createdAt', sortOrder: 'desc' });

      expect(client.get).toHaveBeenCalledWith('/invoices', {
        params: { search: 'INV-001', sortBy: 'createdAt', sortOrder: 'desc' },
      });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /invoices/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'inv1' } });

      const result = await invoicesApi.getById('inv1');

      expect(client.get).toHaveBeenCalledWith('/invoices/inv1');
      expect(result.data.id).toBe('inv1');
    });

    it('should return invoice data', async () => {
      const invoice = { id: 'inv1', invoiceNumber: 'INV-001', status: 'draft' };
      vi.mocked(client.get).mockResolvedValue({ data: invoice });

      const result = await invoicesApi.getById('inv1');

      expect(result.data).toEqual(invoice);
    });

    it('should use correct id in URL', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await invoicesApi.getById('invoice-xyz');

      expect(client.get).toHaveBeenCalledWith('/invoices/invoice-xyz');
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /invoices with data', async () => {
      const data = {
        contactId: 'c1',
        items: [{ description: 'Flight', quantity: 2, rate: 15000 }],
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv1' } });

      await invoicesApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/invoices', data);
    });

    it('should pass all optional fields', async () => {
      const data = {
        contactId: 'c1',
        leadId: 'l1',
        type: 'tax_invoice' as const,
        items: [{ description: 'Hotel', quantity: 3, rate: 5000, hsnCode: '9963', taxRate: 18 }],
        discountType: 'percentage' as const,
        discountValue: 10,
        dueDate: '2026-04-01',
        notes: 'Advance payment',
        currency: 'INR',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv2' } });

      await invoicesApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/invoices', data);
    });

    it('should return created invoice', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv3', invoiceNumber: 'INV-003' } });

      const result = await invoicesApi.create({
        contactId: 'c1',
        items: [{ description: 'Test', quantity: 1, rate: 100 }],
      });

      expect(result.data.id).toBe('inv3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /invoices/:id with data', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'inv1' } });

      await invoicesApi.update('inv1', { notes: 'Updated notes' });

      expect(client.put).toHaveBeenCalledWith('/invoices/inv1', { notes: 'Updated notes' });
    });

    it('should pass items update', async () => {
      const data = { items: [{ description: 'Updated item', quantity: 1, rate: 200 }] };
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await invoicesApi.update('inv1', data);

      expect(client.put).toHaveBeenCalledWith('/invoices/inv1', data);
    });

    it('should return updated invoice', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'inv1', notes: 'New' } });

      const result = await invoicesApi.update('inv1', { notes: 'New' });

      expect(result.data.notes).toBe('New');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /invoices/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await invoicesApi.delete('inv1');

      expect(client.delete).toHaveBeenCalledWith('/invoices/inv1');
    });

    it('should pass correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await invoicesApi.delete('inv-abc');

      expect(client.delete).toHaveBeenCalledWith('/invoices/inv-abc');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await invoicesApi.delete('inv1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── getPayments ───────────────────────────────────────────────
  describe('getPayments', () => {
    it('should call GET /invoices/:id/payments', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await invoicesApi.getPayments('inv1');

      expect(client.get).toHaveBeenCalledWith('/invoices/inv1/payments', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await invoicesApi.getPayments('inv1', { page: 1, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/invoices/inv1/payments', { params: { page: 1, limit: 10 } });
    });

    it('should return paginated payments', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: { data: [{ id: 'p1', amount: 5000 }], pagination: { page: 1, total: 1 } },
      });

      const result = await invoicesApi.getPayments('inv1');

      expect(result.data.data).toHaveLength(1);
    });
  });

  // ─── void ──────────────────────────────────────────────────────
  describe('void', () => {
    it('should call POST /invoices/:id/void', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv1', status: 'void' } });

      await invoicesApi.void('inv1');

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/void', undefined);
    });

    it('should pass reason when provided', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await invoicesApi.void('inv1', { reason: 'Duplicate' });

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/void', { reason: 'Duplicate' });
    });

    it('should return voided invoice', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv1', status: 'void' } });

      const result = await invoicesApi.void('inv1');

      expect(result.data.status).toBe('void');
    });
  });

  // ─── duplicate ─────────────────────────────────────────────────
  describe('duplicate', () => {
    it('should call POST /invoices/:id/duplicate', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv2' } });

      await invoicesApi.duplicate('inv1');

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/duplicate', undefined);
    });

    it('should pass optional params', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv2' } });

      await invoicesApi.duplicate('inv1', { newInvoiceNumber: 'INV-002', newIssueDate: '2026-04-01' });

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/duplicate', {
        newInvoiceNumber: 'INV-002',
        newIssueDate: '2026-04-01',
      });
    });

    it('should return new invoice', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv-new', invoiceNumber: 'INV-NEW' } });

      const result = await invoicesApi.duplicate('inv1');

      expect(result.data.id).toBe('inv-new');
    });
  });

  // ─── send ──────────────────────────────────────────────────────
  describe('send', () => {
    it('should call POST /invoices/:id/send via email', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await invoicesApi.send('inv1', { channel: 'email', to: 'client@test.com' });

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/send', { channel: 'email', to: 'client@test.com' });
    });

    it('should call POST /invoices/:id/send via whatsapp', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await invoicesApi.send('inv1', { channel: 'whatsapp', to: '+919876543210' });

      expect(client.post).toHaveBeenCalledWith('/invoices/inv1/send', { channel: 'whatsapp', to: '+919876543210' });
    });

    it('should return response', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv1', sentAt: '2026-01-01' } });

      const result = await invoicesApi.send('inv1', { channel: 'email', to: 'test@test.com' });

      expect(result.data).toBeDefined();
    });
  });

  // ─── summary ───────────────────────────────────────────────────
  describe('summary', () => {
    it('should call GET /invoices/summary', async () => {
      const mockSummary = { data: { outstanding: 100000, overdue: 25000, paidThisMonth: 75000, invoicedThisMonth: 150000 } };
      vi.mocked(client.get).mockResolvedValue(mockSummary);

      const result = await invoicesApi.summary();

      expect(client.get).toHaveBeenCalledWith('/invoices/summary');
      expect(result.data.outstanding).toBe(100000);
    });

    it('should return all summary fields', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: { outstanding: 0, overdue: 0, paidThisMonth: 0, invoicedThisMonth: 0 },
      });

      const result = await invoicesApi.summary();

      expect(result.data).toHaveProperty('outstanding');
      expect(result.data).toHaveProperty('overdue');
      expect(result.data).toHaveProperty('paidThisMonth');
      expect(result.data).toHaveProperty('invoicedThisMonth');
    });

    it('should not require any params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await invoicesApi.summary();

      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  // ─── fromItinerary ─────────────────────────────────────────────
  describe('fromItinerary', () => {
    it('should call POST /invoices/from-itinerary', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv1' } });

      await invoicesApi.fromItinerary({ itineraryId: 'itn1' });

      expect(client.post).toHaveBeenCalledWith('/invoices/from-itinerary', { itineraryId: 'itn1' });
    });

    it('should return created invoice', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'inv-from-itn', invoiceNumber: 'INV-100' } });

      const result = await invoicesApi.fromItinerary({ itineraryId: 'itn1' });

      expect(result.data.id).toBe('inv-from-itn');
    });

    it('should pass itinerary id in body', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await invoicesApi.fromItinerary({ itineraryId: 'itn-abc' });

      expect(client.post).toHaveBeenCalledWith('/invoices/from-itinerary', { itineraryId: 'itn-abc' });
    });
  });

  // ─── tax regime (R201) ─────────────────────────────────────────
  describe('tax regime on the invoice', () => {
    it('reads the stored regime, breakdown, notes and tax ids from the API row', () => {
      const inv = normalizeInvoiceDetail({
        id: 'i1', invoice_number: 'INV-1', total: 1000, total_tax: 0, items: [],
        tax_regime: 'vat',
        tax_breakdown: JSON.stringify([{ code: 'VAT', rate: 0, base: 1000, amount: 0, label: 'VAT' }]),
        tax_notes: JSON.stringify(['Reverse charge: the customer accounts for VAT']),
        seller_tax_id: 'DE811111111', buyer_tax_id: 'FR12345678901', place_of_supply: 'FR',
      });
      expect(inv?.taxRegime).toBe('vat');
      expect(inv?.taxBreakdown).toEqual([{ code: 'VAT', rate: 0, base: 1000, amount: 0, label: 'VAT' }]);
      expect(inv?.taxNotes).toEqual(['Reverse charge: the customer accounts for VAT']);
      expect([inv?.sellerTaxId, inv?.buyerTaxId, inv?.placeOfSupply]).toEqual(['DE811111111', 'FR12345678901', 'FR']);
    });

    it('treats an invoice from before the tax engine as GST with no breakdown', () => {
      const inv = normalizeInvoiceDetail({ id: 'i2', total: 118, total_tax: 18, cgst: 9, sgst: 9, items: [] });
      expect(inv?.taxRegime).toBe('gst');
      expect(inv?.taxBreakdown).toEqual([]);
      expect(inv?.taxNotes).toEqual([]);
      expect(inv?.buyerTaxId).toBeNull();
    });

    it('asks the API for the tax preview and returns it', async () => {
      const body = { regime: 'sales_tax', treatment: 'sales_tax', taxLines: [], notes: [], total: 1088.75, defaultRate: 8.875 };
      vi.mocked(client.post).mockResolvedValue({ data: body });
      const preview = await invoicesApi.taxPreview({ contactId: 'c1', items: [{ rate: 1000, quantity: 1 }], gstRate: 18 });
      expect(client.post).toHaveBeenCalledWith('/invoices/tax-preview', { contactId: 'c1', items: [{ rate: 1000, quantity: 1 }], gstRate: 18 });
      expect(preview?.regime).toBe('sales_tax');
    });
  });
});
