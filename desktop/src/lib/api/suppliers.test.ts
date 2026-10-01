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
import { suppliersApi } from './suppliers';

describe('suppliersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /suppliers with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.list();

      expect(client.get).toHaveBeenCalledWith('/suppliers', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.list({ category: 'hotel', status: 'active', isPreferred: true });

      expect(client.get).toHaveBeenCalledWith('/suppliers', {
        params: { category: 'hotel', status: 'active', is_preferred: true },
      });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.list({ page: 3, limit: 25, sortBy: 'companyName', sortOrder: 'asc' });

      expect(client.get).toHaveBeenCalledWith('/suppliers', {
        params: { page: 3, limit: 25, sortBy: 'companyName', sortOrder: 'asc' },
      });
    });

    it('should pass search param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.list({ search: 'Taj' });

      expect(client.get).toHaveBeenCalledWith('/suppliers', { params: { search: 'Taj' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /suppliers/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 's1', companyName: 'Taj Hotels' } });

      const result = await suppliersApi.getById('s1');

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1');
      expect(result.data.companyName).toBe('Taj Hotels');
    });

    it('should return full supplier data', async () => {
      const supplier = { id: 's1', companyName: 'Taj', category: 'hotel', isPreferred: true };
      vi.mocked(client.get).mockResolvedValue({ data: supplier });

      const result = await suppliersApi.getById('s1');

      expect(result.data).toEqual(supplier);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await suppliersApi.getById('sup-xyz');

      expect(client.get).toHaveBeenCalledWith('/suppliers/sup-xyz');
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /suppliers with data', async () => {
      const data = { companyName: 'New Supplier', category: 'hotel' as const };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's1' } });

      await suppliersApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/suppliers', data);
    });

    it('should pass all optional fields', async () => {
      const data = {
        companyName: 'Full Supplier',
        category: 'transport' as const,
        contactPerson: 'John',
        email: 'supplier@test.com',
        phone: '+91999',
        address: '123 Main St',
        city: 'Mumbai',
        country: 'India',
        gstNumber: 'GST123',
        website: 'https://supplier.com',
        isPreferred: true,
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's2' } });

      await suppliersApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/suppliers', data);
    });

    it('should return created supplier', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's3', companyName: 'New' } });

      const result = await suppliersApi.create({ companyName: 'New', category: 'airline' as const });

      expect(result.data.id).toBe('s3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /suppliers/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 's1' } });

      await suppliersApi.update('s1', { companyName: 'Updated' });

      expect(client.put).toHaveBeenCalledWith('/suppliers/s1', { companyName: 'Updated' });
    });

    it('should pass partial update', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await suppliersApi.update('s1', { status: 'inactive', notes: 'Temporarily disabled' });

      expect(client.put).toHaveBeenCalledWith('/suppliers/s1', { status: 'inactive', notes: 'Temporarily disabled' });
    });

    it('should return updated supplier', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 's1', companyName: 'Updated' } });

      const result = await suppliersApi.update('s1', { companyName: 'Updated' });

      expect(result.data.companyName).toBe('Updated');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /suppliers/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await suppliersApi.delete('s1');

      expect(client.delete).toHaveBeenCalledWith('/suppliers/s1');
    });

    it('should pass correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await suppliersApi.delete('sup-xyz');

      expect(client.delete).toHaveBeenCalledWith('/suppliers/sup-xyz');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await suppliersApi.delete('s1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── getRateCards ──────────────────────────────────────────────
  describe('getRateCards', () => {
    it('should call GET /suppliers/:id/rate-cards', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.getRateCards('s1');

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/rate-cards', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.getRateCards('s1', { page: 1, limit: 5 });

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/rate-cards', { params: { page: 1, limit: 5 } });
    });

    it('should return rate cards list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'rc1' }], pagination: {} } });

      const result = await suppliersApi.getRateCards('s1');

      expect(result.data.data).toHaveLength(1);
    });
  });

  // ─── getPayments ───────────────────────────────────────────────
  describe('getPayments', () => {
    it('should call GET /suppliers/:id/payments', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.getPayments('s1');

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/payments', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await suppliersApi.getPayments('s1', { page: 2, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/payments', { params: { page: 2, limit: 10 } });
    });

    it('should return payments list', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: { data: [{ id: 'sp1', amount: 50000 }], pagination: {} },
      });

      const result = await suppliersApi.getPayments('s1');

      expect(result.data.data[0].amount).toBe(50000);
    });
  });

  // ─── getLedger ─────────────────────────────────────────────────
  describe('getLedger', () => {
    it('should call GET /suppliers/:id/ledger', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.getLedger('s1');

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/ledger', { params: undefined });
    });

    it('should pass date range', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.getLedger('s1', { fromDate: '2026-01-01', toDate: '2026-03-31' });

      expect(client.get).toHaveBeenCalledWith('/suppliers/s1/ledger', {
        params: { fromDate: '2026-01-01', toDate: '2026-03-31' },
      });
    });

    it('should return ledger entries', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'le1', debitAmount: 1000, runningBalance: 1000 }] });

      const result = await suppliersApi.getLedger('s1');

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── togglePreferred ──────────────────────────────────────────
  describe('togglePreferred', () => {
    it('should call POST /suppliers/:id/toggle-preferred', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's1', isPreferred: true } });

      await suppliersApi.togglePreferred('s1', { isPreferred: true });

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/toggle-preferred', { isPreferred: true });
    });

    it('should toggle to not preferred', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's1', isPreferred: false } });

      await suppliersApi.togglePreferred('s1', { isPreferred: false });

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/toggle-preferred', { isPreferred: false });
    });

    it('should return updated supplier', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 's1', isPreferred: true } });

      const result = await suppliersApi.togglePreferred('s1', { isPreferred: true });

      expect(result.data.isPreferred).toBe(true);
    });
  });

  // ─── rateSupplier ──────────────────────────────────────────────
  describe('rateSupplier', () => {
    it('should call POST /suppliers/:id/rate', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Rated' } });

      await suppliersApi.rateSupplier('s1', { rating: 4 });

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/rate', { rating: 4 });
    });

    it('should pass optional comment', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Rated' } });

      await suppliersApi.rateSupplier('s1', { rating: 5, comment: 'Excellent service' });

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/rate', { rating: 5, comment: 'Excellent service' });
    });

    it('should return success message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Rating saved' } });

      const result = await suppliersApi.rateSupplier('s1', { rating: 3 });

      expect(result.data.message).toBeTruthy();
    });
  });

  // ─── getCategorySummary ────────────────────────────────────────
  describe('getCategorySummary', () => {
    it('should call GET /suppliers/categories/summary', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.getCategorySummary();

      expect(client.get).toHaveBeenCalledWith('/suppliers/categories/summary');
    });

    it('should return category summary list', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: [{ category: 'hotel', totalSuppliers: 10, preferredCount: 3 }],
      });

      const result = await suppliersApi.getCategorySummary();

      expect(result.data[0].category).toBe('hotel');
    });

    it('should not require parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.getCategorySummary();

      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  // ─── compareRates ──────────────────────────────────────────────
  describe('compareRates', () => {
    it('should call GET /suppliers/compare-rates', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.compareRates({ service_type: 'hotel', destination: 'Bali' });

      expect(client.get).toHaveBeenCalledWith('/suppliers/compare-rates', {
        params: { service_type: 'hotel', destination: 'Bali' },
      });
    });

    it('should pass optional season and date', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await suppliersApi.compareRates({ service_type: 'transport', destination: 'Goa', season: 'peak', date: '2026-12-25' });

      expect(client.get).toHaveBeenCalledWith('/suppliers/compare-rates', {
        params: { service_type: 'transport', destination: 'Goa', season: 'peak', date: '2026-12-25' },
      });
    });

    it('should return rate comparisons', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: [{ supplierId: 's1', supplierName: 'Taj', rate: 5000 }],
      });

      const result = await suppliersApi.compareRates({ service_type: 'hotel', destination: 'Mumbai' });

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── recordPayment ─────────────────────────────────────────────
  describe('recordPayment', () => {
    it('should call POST /suppliers/:id/payments', async () => {
      const data = { amount: 25000, method: 'transfer', payment_date: '2026-03-01' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sp1' } });

      await suppliersApi.recordPayment('s1', data);

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/payments', data);
    });

    it('should pass optional fields', async () => {
      const data = {
        amount: 50000,
        method: 'cheque',
        payment_date: '2026-03-15',
        reference_number: 'CHQ-123',
        notes: 'Quarterly payment',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sp2' } });

      await suppliersApi.recordPayment('s1', data);

      expect(client.post).toHaveBeenCalledWith('/suppliers/s1/payments', data);
    });

    it('should return created payment id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'sp3' } });

      const result = await suppliersApi.recordPayment('s1', { amount: 10000, method: 'cash', payment_date: '2026-03-01' });

      expect(result.data.id).toBe('sp3');
    });
  });
});
