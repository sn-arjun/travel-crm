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
import { creditNotesApi, debitNotesApi } from './credit-notes';

describe('creditNotesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /credit-notes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await creditNotesApi.list();
      expect(client.get).toHaveBeenCalledWith('/credit-notes', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await creditNotesApi.list({ page: 1, limit: 20 });
      expect(client.get).toHaveBeenCalledWith('/credit-notes', { params: { page: 1, limit: 20 } });
    });

    it('should pass contactId filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await creditNotesApi.list({ contactId: 'c1' });
      expect(client.get).toHaveBeenCalledWith('/credit-notes', { params: { contactId: 'c1' } });
    });

    it('should return credit notes list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'cn1', type: 'credit_note', total: 5000 }], pagination: { total: 1 } } });
      const result = await creditNotesApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should call POST /credit-notes', async () => {
      const data = { invoiceId: 'inv1', reason: 'Overcharge', items: [{ description: 'Refund', quantity: 1, rate: 1000 }] };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cn1' } });
      await creditNotesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/credit-notes', data);
    });

    it('should pass notes and tax', async () => {
      const data = { invoiceId: 'inv1', reason: 'Partial refund', notes: 'Customer request', items: [{ description: 'Hotel refund', quantity: 1, rate: 2000, taxRate: 18 }] };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cn2' } });
      await creditNotesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/credit-notes', expect.objectContaining({ notes: 'Customer request' }));
    });

    it('should pass multiple items', async () => {
      const data = {
        invoiceId: 'inv1',
        reason: 'Multiple adjustments',
        items: [
          { description: 'Item 1', quantity: 2, rate: 500 },
          { description: 'Item 2', quantity: 1, rate: 1500, taxRate: 12 },
        ],
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cn3' } });
      await creditNotesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/credit-notes', expect.objectContaining({ items: expect.arrayContaining([expect.objectContaining({ description: 'Item 1' }), expect.objectContaining({ description: 'Item 2' })]) }));
    });

    it('should return created credit note', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cn4', type: 'credit_note', total: 3000, status: 'draft' } });
      const result = await creditNotesApi.create({ invoiceId: 'inv1', reason: 'Test', items: [{ description: 'Test', quantity: 1, rate: 3000 }] });
      expect(result.data.id).toBe('cn4');
      expect(result.data.status).toBe('draft');
    });
  });

  describe('apply', () => {
    it('should call POST /credit-notes/:id/apply', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 1000, balanceDue: 4000 } });
      await creditNotesApi.apply('cn1', { amount: 1000 });
      expect(client.post).toHaveBeenCalledWith('/credit-notes/cn1/apply', { amount: 1000 });
    });

    it('should use correct id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 500, balanceDue: 0 } });
      await creditNotesApi.apply('cn-xyz', { amount: 500 });
      expect(client.post).toHaveBeenCalledWith('/credit-notes/cn-xyz/apply', { amount: 500 });
    });

    it('should return applied amount and balance', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 2000, balanceDue: 3000 } });
      const result = await creditNotesApi.apply('cn1', { amount: 2000 });
      expect(result.data.appliedAmount).toBe(2000);
      expect(result.data.balanceDue).toBe(3000);
    });
  });
});

describe('debitNotesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /debit-notes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await debitNotesApi.list();
      expect(client.get).toHaveBeenCalledWith('/debit-notes', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await debitNotesApi.list({ page: 2, limit: 15 });
      expect(client.get).toHaveBeenCalledWith('/debit-notes', { params: { page: 2, limit: 15 } });
    });

    it('should pass contactId filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await debitNotesApi.list({ contactId: 'c2' });
      expect(client.get).toHaveBeenCalledWith('/debit-notes', { params: { contactId: 'c2' } });
    });

    it('should return debit notes list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'dn1', type: 'debit_note', total: 7500 }], pagination: { total: 1 } } });
      const result = await debitNotesApi.list();
      expect(result.data.data).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should call POST /debit-notes', async () => {
      const data = { invoiceId: 'inv1', reason: 'Additional charges', items: [{ description: 'Surcharge', quantity: 1, rate: 500 }] };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'dn1' } });
      await debitNotesApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/debit-notes', data);
    });

    it('should pass notes', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'dn2' } });
      await debitNotesApi.create({ invoiceId: 'inv2', reason: 'Late fee', notes: 'Applied per policy', items: [{ description: 'Late fee', quantity: 1, rate: 200 }] });
      expect(client.post).toHaveBeenCalledWith('/debit-notes', expect.objectContaining({ notes: 'Applied per policy' }));
    });

    it('should return created debit note', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'dn3', type: 'debit_note', total: 1500, status: 'draft' } });
      const result = await debitNotesApi.create({ invoiceId: 'inv1', reason: 'Test', items: [{ description: 'Test', quantity: 1, rate: 1500 }] });
      expect(result.data.id).toBe('dn3');
    });
  });

  describe('apply', () => {
    it('should call POST /debit-notes/:id/apply', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 800, balanceDue: 6700 } });
      await debitNotesApi.apply('dn1', { amount: 800 });
      expect(client.post).toHaveBeenCalledWith('/debit-notes/dn1/apply', { amount: 800 });
    });

    it('should use correct id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 300, balanceDue: 0 } });
      await debitNotesApi.apply('dn-abc', { amount: 300 });
      expect(client.post).toHaveBeenCalledWith('/debit-notes/dn-abc/apply', { amount: 300 });
    });

    it('should return applied amount and balance', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { appliedAmount: 5000, balanceDue: 2500 } });
      const result = await debitNotesApi.apply('dn1', { amount: 5000 });
      expect(result.data.appliedAmount).toBe(5000);
      expect(result.data.balanceDue).toBe(2500);
    });
  });
});
