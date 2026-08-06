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
import { paymentsApi } from './payments';

describe('paymentsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /payments with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await paymentsApi.list();

      expect(client.get).toHaveBeenCalledWith('/payments', { params: {} });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await paymentsApi.list({ page: 2, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/payments', { params: { page: 2, limit: 10 } });
    });

    it('should remap paymentMethod to method for backend', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await paymentsApi.list({ paymentMethod: 'card' });

      expect(client.get).toHaveBeenCalledWith('/payments', { params: { method: 'card' } });
    });

    it('should pass search and sort params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await paymentsApi.list({ search: 'TXN', sortBy: 'amount', sortOrder: 'desc' });

      expect(client.get).toHaveBeenCalledWith('/payments', {
        params: { search: 'TXN', sortBy: 'amount', sortOrder: 'desc' },
      });
    });

    it('should pass method param directly without remapping', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await paymentsApi.list({ method: 'cash' });

      expect(client.get).toHaveBeenCalledWith('/payments', { params: { method: 'cash' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /payments/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'p1', amount: 5000 } });

      const result = await paymentsApi.getById('p1');

      expect(client.get).toHaveBeenCalledWith('/payments/p1');
      expect(result.data.amount).toBe(5000);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await paymentsApi.getById('pay-xyz');

      expect(client.get).toHaveBeenCalledWith('/payments/pay-xyz');
    });

    it('should return payment data', async () => {
      const payment = { id: 'p1', amount: 10000, method: 'card', reference: 'TXN123' };
      vi.mocked(client.get).mockResolvedValue({ data: payment });

      const result = await paymentsApi.getById('p1');

      expect(result.data).toEqual(payment);
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /payments with data', async () => {
      const data = { invoiceId: 'inv1', amount: 5000, method: 'cash' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'p1' } });

      await paymentsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/payments', data);
    });

    it('should pass all optional fields', async () => {
      const data = {
        invoiceId: 'inv1',
        amount: 10000,
        method: 'transfer',
        reference: 'TXN-456',
        notes: 'Full payment',
        date: '2026-03-01',
        receiptUrl: 'https://example.com/receipt.pdf',
        isAdvance: true,
        leadId: 'l1',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'p2' } });

      await paymentsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/payments', data);
    });

    it('should return created payment', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'p3', amount: 7500 } });

      const result = await paymentsApi.create({ invoiceId: 'inv1', amount: 7500, method: 'card' });

      expect(result.data.id).toBe('p3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /payments/:id with data', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'p1' } });

      await paymentsApi.update('p1', { amount: 6000 });

      expect(client.put).toHaveBeenCalledWith('/payments/p1', { amount: 6000 });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await paymentsApi.update('p1', { reference: 'REF-NEW', notes: 'Updated' });

      expect(client.put).toHaveBeenCalledWith('/payments/p1', { reference: 'REF-NEW', notes: 'Updated' });
    });

    it('should return updated payment', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'p1', amount: 6000 } });

      const result = await paymentsApi.update('p1', { amount: 6000 });

      expect(result.data.amount).toBe(6000);
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /payments/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await paymentsApi.delete('p1');

      expect(client.delete).toHaveBeenCalledWith('/payments/p1');
    });

    it('should pass correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await paymentsApi.delete('pay-999');

      expect(client.delete).toHaveBeenCalledWith('/payments/pay-999');
    });

    it('should return void response', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await paymentsApi.delete('p1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── linkInvoice ───────────────────────────────────────────────
  describe('linkInvoice', () => {
    it('should call POST /payments/:id/link-invoice', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'p1' } });

      await paymentsApi.linkInvoice('p1', { invoiceId: 'inv1' });

      expect(client.post).toHaveBeenCalledWith('/payments/p1/link-invoice', { invoiceId: 'inv1' });
    });

    it('should pass optional amount', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await paymentsApi.linkInvoice('p1', { invoiceId: 'inv2', amount: 3000 });

      expect(client.post).toHaveBeenCalledWith('/payments/p1/link-invoice', { invoiceId: 'inv2', amount: 3000 });
    });

    it('should return linked payment', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'p1', invoiceId: 'inv1' } });

      const result = await paymentsApi.linkInvoice('p1', { invoiceId: 'inv1' });

      expect(result.data).toBeDefined();
    });

    it('should use correct payment id in URL', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await paymentsApi.linkInvoice('pay-abc', { invoiceId: 'inv-xyz' });

      expect(client.post).toHaveBeenCalledWith('/payments/pay-abc/link-invoice', { invoiceId: 'inv-xyz' });
    });
  });
});
