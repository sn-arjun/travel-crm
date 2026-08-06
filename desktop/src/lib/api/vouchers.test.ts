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
import { vouchersApi } from './vouchers';

describe('vouchersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /vouchers with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await vouchersApi.list();

      expect(client.get).toHaveBeenCalledWith('/vouchers', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await vouchersApi.list({ status: 'draft', type: 'hotel', leadId: 'l1' });

      expect(client.get).toHaveBeenCalledWith('/vouchers', {
        params: { status: 'draft', type: 'hotel', leadId: 'l1' },
      });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await vouchersApi.list({ page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' });

      expect(client.get).toHaveBeenCalledWith('/vouchers', {
        params: { page: 2, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' },
      });
    });

    it('should pass supplierId filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await vouchersApi.list({ supplierId: 's1' });

      expect(client.get).toHaveBeenCalledWith('/vouchers', { params: { supplierId: 's1' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /vouchers/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'v1' } });

      const result = await vouchersApi.getById('v1');

      expect(client.get).toHaveBeenCalledWith('/vouchers/v1');
      expect(result.data.id).toBe('v1');
    });

    it('should return voucher data', async () => {
      const voucher = { id: 'v1', title: 'Hotel Booking', type: 'hotel', status: 'draft' };
      vi.mocked(client.get).mockResolvedValue({ data: voucher });

      const result = await vouchersApi.getById('v1');

      expect(result.data).toEqual(voucher);
    });

    it('should use correct id in URL', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await vouchersApi.getById('voucher-abc');

      expect(client.get).toHaveBeenCalledWith('/vouchers/voucher-abc');
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /vouchers with data', async () => {
      const data = { leadId: 'l1', type: 'hotel' as const, title: 'Taj Hotel', details: { checkIn: '2026-06-01' } };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v1' } });

      await vouchersApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/vouchers', data);
    });

    it('should pass all optional fields', async () => {
      const data = {
        leadId: 'l1',
        type: 'transport' as const,
        title: 'Airport Transfer',
        details: { pickup: 'Airport' },
        supplierId: 's1',
        language: 'en',
        notes: 'VIP client',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v2' } });

      await vouchersApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/vouchers', data);
    });

    it('should return created voucher', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v3', title: 'New Voucher' } });

      const result = await vouchersApi.create({
        leadId: 'l1',
        type: 'activity' as const,
        title: 'Scuba Diving',
        details: {},
      });

      expect(result.data.id).toBe('v3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /vouchers/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'v1' } });

      await vouchersApi.update('v1', { title: 'Updated Voucher' });

      expect(client.put).toHaveBeenCalledWith('/vouchers/v1', { title: 'Updated Voucher' });
    });

    it('should pass partial update fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await vouchersApi.update('v1', { details: { rooms: 2 }, notes: 'Changed rooms' });

      expect(client.put).toHaveBeenCalledWith('/vouchers/v1', { details: { rooms: 2 }, notes: 'Changed rooms' });
    });

    it('should return updated voucher', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'v1', title: 'Updated' } });

      const result = await vouchersApi.update('v1', { title: 'Updated' });

      expect(result.data.title).toBe('Updated');
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────
  describe('updateStatus', () => {
    it('should call PATCH /vouchers/:id/status', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'v1', status: 'sent' } });

      await vouchersApi.updateStatus('v1', { status: 'sent' });

      expect(client.patch).toHaveBeenCalledWith('/vouchers/v1/status', { status: 'sent' });
    });

    it('should set status to confirmed', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'v1', status: 'confirmed' } });

      await vouchersApi.updateStatus('v1', { status: 'confirmed' });

      expect(client.patch).toHaveBeenCalledWith('/vouchers/v1/status', { status: 'confirmed' });
    });

    it('should return updated voucher', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'v1', status: 'sent' } });

      const result = await vouchersApi.updateStatus('v1', { status: 'sent' });

      expect(result.data.status).toBe('sent');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /vouchers/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await vouchersApi.delete('v1');

      expect(client.delete).toHaveBeenCalledWith('/vouchers/v1');
    });

    it('should pass correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await vouchersApi.delete('v-abc');

      expect(client.delete).toHaveBeenCalledWith('/vouchers/v-abc');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await vouchersApi.delete('v1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── send ──────────────────────────────────────────────────────
  describe('send', () => {
    it('should call POST /vouchers/:id/send', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      await vouchersApi.send('v1', { channel: 'email', to: 'client@test.com' });

      expect(client.post).toHaveBeenCalledWith('/vouchers/v1/send', { channel: 'email', to: 'client@test.com' });
    });

    it('should send via whatsapp', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      await vouchersApi.send('v1', { channel: 'whatsapp', to: '+919876543210' });

      expect(client.post).toHaveBeenCalledWith('/vouchers/v1/send', { channel: 'whatsapp', to: '+919876543210' });
    });

    it('should return sent count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      const result = await vouchersApi.send('v1', { channel: 'email', to: 'test@test.com' });

      expect(result.data.sent).toBe(1);
    });
  });

  // ─── getPdf ────────────────────────────────────────────────────
  describe('getPdf', () => {
    it('should call GET /vouchers/:id/pdf with blob responseType', async () => {
      const blob = new Blob(['pdf-data']);
      vi.mocked(client.get).mockResolvedValue(blob);

      await vouchersApi.getPdf('v1');

      expect(client.get).toHaveBeenCalledWith('/vouchers/v1/pdf', { responseType: 'blob' });
    });

    it('should return blob', async () => {
      const blob = new Blob(['data']);
      vi.mocked(client.get).mockResolvedValue(blob);

      const result = await vouchersApi.getPdf('v1');

      expect(result).toBeInstanceOf(Blob);
    });

    it('should use correct voucher id', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());

      await vouchersApi.getPdf('voucher-xyz');

      expect(client.get).toHaveBeenCalledWith('/vouchers/voucher-xyz/pdf', { responseType: 'blob' });
    });
  });

  // ─── getByLead ─────────────────────────────────────────────────
  describe('getByLead', () => {
    it('should call GET /vouchers/by-lead/:leadId', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await vouchersApi.getByLead('l1');

      expect(client.get).toHaveBeenCalledWith('/vouchers/by-lead/l1');
    });

    it('should return grouped vouchers', async () => {
      const data = [
        { type: 'hotel', vouchers: [{ id: 'v1' }] },
        { type: 'transport', vouchers: [{ id: 'v2' }] },
      ];
      vi.mocked(client.get).mockResolvedValue({ data });

      const result = await vouchersApi.getByLead('l1');

      expect(result.data).toHaveLength(2);
    });

    it('should use correct lead id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await vouchersApi.getByLead('lead-abc');

      expect(client.get).toHaveBeenCalledWith('/vouchers/by-lead/lead-abc');
    });
  });

  // ─── bulkSend ──────────────────────────────────────────────────
  describe('bulkSend', () => {
    it('should call POST /vouchers/bulk-send', async () => {
      const data = { leadId: 'l1', voucherIds: ['v1', 'v2'], channel: 'email' as const, to: 'client@test.com' };
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 2 } });

      await vouchersApi.bulkSend(data);

      expect(client.post).toHaveBeenCalledWith('/vouchers/bulk-send', data);
    });

    it('should return sent count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 3 } });

      const result = await vouchersApi.bulkSend({
        leadId: 'l1',
        voucherIds: ['v1', 'v2', 'v3'],
        channel: 'whatsapp',
        to: '+919876543210',
      });

      expect(result.data.sent).toBe(3);
    });

    it('should pass all required fields', async () => {
      const data = { leadId: 'l1', voucherIds: ['v1'], channel: 'both' as const, to: 'test@test.com' };
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      await vouchersApi.bulkSend(data);

      expect(client.post).toHaveBeenCalledWith('/vouchers/bulk-send', data);
    });
  });

  // ─── fromItineraryItem ─────────────────────────────────────────
  describe('fromItineraryItem', () => {
    it('should call POST /vouchers/from-itinerary-item', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v1' } });

      await vouchersApi.fromItineraryItem({ itineraryItemId: 'item1' });

      expect(client.post).toHaveBeenCalledWith('/vouchers/from-itinerary-item', { itineraryItemId: 'item1' });
    });

    it('should return created voucher', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v-new', title: 'Auto Voucher' } });

      const result = await vouchersApi.fromItineraryItem({ itineraryItemId: 'item-xyz' });

      expect(result.data.id).toBe('v-new');
    });
  });
});
