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
import { itinerariesApi } from './itineraries';

describe('itinerariesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /itineraries with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.list();

      expect(client.get).toHaveBeenCalledWith('/itineraries', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.list({ status: 'draft', leadId: 'l1', destination: 'Bali' });

      expect(client.get).toHaveBeenCalledWith('/itineraries', {
        params: { status: 'draft', leadId: 'l1', destination: 'Bali' },
      });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.list({ page: 2, limit: 10, sortBy: 'title', sortOrder: 'asc' });

      expect(client.get).toHaveBeenCalledWith('/itineraries', {
        params: { page: 2, limit: 10, sortBy: 'title', sortOrder: 'asc' },
      });
    });

    it('should pass search param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.list({ search: 'Maldives' });

      expect(client.get).toHaveBeenCalledWith('/itineraries', { params: { search: 'Maldives' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /itineraries/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'itn1', title: 'Bali Trip' } });

      const result = await itinerariesApi.getById('itn1');

      expect(client.get).toHaveBeenCalledWith('/itineraries/itn1');
      expect(result.data.title).toBe('Bali Trip');
    });

    it('should return itinerary with days', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'itn1', days: [{ dayNumber: 1 }] } });

      const result = await itinerariesApi.getById('itn1');

      expect(result.data.days).toHaveLength(1);
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await itinerariesApi.getById('itn-abc');

      expect(client.get).toHaveBeenCalledWith('/itineraries/itn-abc');
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /itineraries with data', async () => {
      const data = {
        leadId: 'l1',
        title: 'Bali 5D4N',
        days: [{ dayNumber: 1, title: 'Arrival' }],
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn1' } });

      await itinerariesApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/itineraries', data);
    });

    it('should pass all optional fields', async () => {
      const data = {
        leadId: 'l1',
        title: 'Full Itinerary',
        validityDate: '2026-06-30',
        notes: 'Custom trip',
        inclusions: ['Breakfast', 'Transfers'],
        exclusions: ['Flights'],
        termsConditions: 'Standard terms',
        currency: 'USD',
        markupType: 'percentage' as const,
        markupValue: 15,
        days: [{ dayNumber: 1, title: 'Day 1', city: 'Denpasar' }],
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn2' } });

      await itinerariesApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/itineraries', data);
    });

    it('should return created itinerary', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn3', title: 'New' } });

      const result = await itinerariesApi.create({
        leadId: 'l1',
        title: 'New',
        days: [],
      });

      expect(result.data.id).toBe('itn3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /itineraries/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'itn1' } });

      await itinerariesApi.update('itn1', { title: 'Updated Title' });

      expect(client.put).toHaveBeenCalledWith('/itineraries/itn1', { title: 'Updated Title' });
    });

    it('should pass status update', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await itinerariesApi.update('itn1', { status: 'approved' });

      expect(client.put).toHaveBeenCalledWith('/itineraries/itn1', { status: 'approved' });
    });

    it('should return updated itinerary', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'itn1', title: 'Updated' } });

      const result = await itinerariesApi.update('itn1', { title: 'Updated' });

      expect(result.data.title).toBe('Updated');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /itineraries/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await itinerariesApi.delete('itn1');

      expect(client.delete).toHaveBeenCalledWith('/itineraries/itn1');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await itinerariesApi.delete('itn1');

      expect(result).toEqual({ data: undefined });
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await itinerariesApi.delete('itn-xyz');

      expect(client.delete).toHaveBeenCalledWith('/itineraries/itn-xyz');
    });
  });

  // ─── clone ─────────────────────────────────────────────────────
  describe('clone', () => {
    it('should call POST /itineraries/:id/clone', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-clone' } });

      await itinerariesApi.clone('itn1');

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/clone', undefined);
    });

    it('should pass target lead id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-clone' } });

      await itinerariesApi.clone('itn1', { targetLeadId: 'l2' });

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/clone', { targetLeadId: 'l2' });
    });

    it('should return cloned itinerary', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-new', title: 'Cloned' } });

      const result = await itinerariesApi.clone('itn1');

      expect(result.data.id).toBe('itn-new');
    });
  });

  // ─── createNewVersion ──────────────────────────────────────────
  describe('createNewVersion', () => {
    it('should call POST /itineraries/:id/new-version', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-v2' } });

      await itinerariesApi.createNewVersion('itn1');

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/new-version', undefined);
    });

    it('should pass changes description', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-v2' } });

      await itinerariesApi.createNewVersion('itn1', { changes: 'Added day 5' });

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/new-version', { changes: 'Added day 5' });
    });

    it('should return new version', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'itn-v3', versionNumber: 3 } });

      const result = await itinerariesApi.createNewVersion('itn1');

      expect(result.data.id).toBe('itn-v3');
    });
  });

  // ─── getVersions ───────────────────────────────────────────────
  describe('getVersions', () => {
    it('should call GET /itineraries/:id/versions', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.getVersions('itn1');

      expect(client.get).toHaveBeenCalledWith('/itineraries/itn1/versions', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await itinerariesApi.getVersions('itn1', { page: 1, limit: 5 });

      expect(client.get).toHaveBeenCalledWith('/itineraries/itn1/versions', { params: { page: 1, limit: 5 } });
    });

    it('should return versions list', async () => {
      vi.mocked(client.get).mockResolvedValue({
        data: { data: [{ id: 'v1', versionNumber: 1 }, { id: 'v2', versionNumber: 2 }], pagination: {} },
      });

      const result = await itinerariesApi.getVersions('itn1');

      expect(result.data.data).toHaveLength(2);
    });
  });

  // ─── send ──────────────────────────────────────────────────────
  describe('send', () => {
    it('should call POST /itineraries/:id/send', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      await itinerariesApi.send('itn1', { channel: 'email', to: 'client@test.com' });

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/send', { channel: 'email', to: 'client@test.com' });
    });

    it('should pass subject and message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      await itinerariesApi.send('itn1', {
        channel: 'email',
        to: 'client@test.com',
        subject: 'Your Bali Itinerary',
        message: 'Please find attached',
      });

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/send', {
        channel: 'email',
        to: 'client@test.com',
        subject: 'Your Bali Itinerary',
        message: 'Please find attached',
      });
    });

    it('should return sent count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { sent: 1 } });

      const result = await itinerariesApi.send('itn1', { channel: 'whatsapp', to: '+91999' });

      expect(result.data.sent).toBe(1);
    });
  });

  // ─── createShareLink ──────────────────────────────────────────
  describe('createShareLink', () => {
    it('should call POST /itineraries/:id/share-link', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { link: 'https://share.app/xyz', expiresAt: '2026-04-01' } });

      await itinerariesApi.createShareLink('itn1');

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/share-link', undefined);
    });

    it('should pass expiry and access level', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { link: 'https://share.app/xyz' } });

      await itinerariesApi.createShareLink('itn1', { expiryDays: 7, accessLevel: 'comment' });

      expect(client.post).toHaveBeenCalledWith('/itineraries/itn1/share-link', { expiryDays: 7, accessLevel: 'comment' });
    });

    it('should return share link response', async () => {
      vi.mocked(client.post).mockResolvedValue({
        data: { link: 'https://app.com/share/abc', expiresAt: '2026-04-15', accessLevel: 'view' },
      });

      const result = await itinerariesApi.createShareLink('itn1');

      expect(result.data.link).toContain('https://');
    });
  });

  // ─── revokeShareLink ──────────────────────────────────────────
  describe('revokeShareLink', () => {
    it('should call DELETE /itineraries/:id/share-link', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await itinerariesApi.revokeShareLink('itn1');

      expect(client.delete).toHaveBeenCalledWith('/itineraries/itn1/share-link');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await itinerariesApi.revokeShareLink('itn-abc');

      expect(client.delete).toHaveBeenCalledWith('/itineraries/itn-abc/share-link');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await itinerariesApi.revokeShareLink('itn1');

      expect(result).toEqual({ data: undefined });
    });
  });
});
