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
import { marketingApi } from './marketing';

describe('marketingApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── segments ──────────────────────────────────────────────────
  describe('segments', () => {
    describe('list', () => {
      it('should call GET /marketing/segments', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.segments.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/segments', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.segments.list({ page: 1, limit: 10, search: 'vip' });
        expect(client.get).toHaveBeenCalledWith('/marketing/segments', { params: { page: 1, limit: 10, search: 'vip' } });
      });

      it('should return segments list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'seg1', name: 'VIP' }], pagination: {} } });
        const result = await marketingApi.segments.list();
        expect(result.data.data).toHaveLength(1);
      });
    });

    describe('create', () => {
      it('should call POST /marketing/segments', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'seg1' } });
        await marketingApi.segments.create({ name: 'New Segment', criteria: { type: 'customer' } });
        expect(client.post).toHaveBeenCalledWith('/marketing/segments', { name: 'New Segment', criteria: { type: 'customer' } });
      });

      it('should return created segment', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'seg2', name: 'Created' } });
        const result = await marketingApi.segments.create({ name: 'Created', criteria: {} });
        expect(result.data.id).toBe('seg2');
      });
    });

    describe('delete', () => {
      it('should call DELETE /marketing/segments/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await marketingApi.segments.delete('seg1');
        expect(client.delete).toHaveBeenCalledWith('/marketing/segments/seg1');
      });
    });
  });

  // ─── branding ──────────────────────────────────────────────────
  describe('branding', () => {
    describe('get', () => {
      it('should call GET /marketing/branding', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'b1', primaryColor: '#000' } });
        const result = await marketingApi.branding.get();
        expect(client.get).toHaveBeenCalledWith('/marketing/branding');
        expect(result.data.primaryColor).toBe('#000');
      });
    });

    describe('update', () => {
      it('should call PUT /marketing/branding', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'b1' } });
        await marketingApi.branding.update({ primaryColor: '#FF0000', fontFamily: 'Inter' });
        expect(client.put).toHaveBeenCalledWith('/marketing/branding', { primaryColor: '#FF0000', fontFamily: 'Inter' });
      });

      it('should return updated branding', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'b1', primaryColor: '#FF0000' } });
        const result = await marketingApi.branding.update({ primaryColor: '#FF0000' });
        expect(result.data.primaryColor).toBe('#FF0000');
      });
    });
  });

  // ─── flyerTemplates ────────────────────────────────────────────
  describe('flyerTemplates', () => {
    describe('list', () => {
      it('should call GET /marketing/flyer-templates', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.flyerTemplates.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/flyer-templates', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.flyerTemplates.list({ category: 'travel', search: 'summer' });
        expect(client.get).toHaveBeenCalledWith('/marketing/flyer-templates', { params: { category: 'travel', search: 'summer' } });
      });
    });
  });

  // ─── flyers ────────────────────────────────────────────────────
  describe('flyers', () => {
    describe('list', () => {
      it('should call GET /marketing/flyers', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.flyers.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/flyers', { params: undefined });
      });

      it('should pass filter and sort params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.flyers.list({ status: 'draft', sortBy: 'createdAt', sortOrder: 'desc' });
        expect(client.get).toHaveBeenCalledWith('/marketing/flyers', { params: { status: 'draft', sortBy: 'createdAt', sortOrder: 'desc' } });
      });
    });

    describe('create', () => {
      it('should call POST /marketing/flyers', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'f1' } });
        await marketingApi.flyers.create({ templateId: 'ft1', title: 'Summer Flyer' });
        expect(client.post).toHaveBeenCalledWith('/marketing/flyers', { templateId: 'ft1', title: 'Summer Flyer' });
      });
    });

    describe('update', () => {
      it('should call PUT /marketing/flyers/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'f1' } });
        await marketingApi.flyers.update('f1', { title: 'Updated Flyer' });
        expect(client.put).toHaveBeenCalledWith('/marketing/flyers/f1', { title: 'Updated Flyer' });
      });
    });

    describe('delete', () => {
      it('should call DELETE /marketing/flyers/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await marketingApi.flyers.delete('f1');
        expect(client.delete).toHaveBeenCalledWith('/marketing/flyers/f1');
      });
    });
  });

  // ─── images ────────────────────────────────────────────────────
  describe('images', () => {
    describe('list', () => {
      it('should call GET /marketing/images', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.images.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/images', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.images.list({ category: 'destination', search: 'beach' });
        expect(client.get).toHaveBeenCalledWith('/marketing/images', { params: { category: 'destination', search: 'beach' } });
      });
    });

    describe('upload', () => {
      it('should call POST /marketing/images with FormData', async () => {
        const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'img1' } });
        await marketingApi.images.upload({ file, title: 'Beach', category: 'destination' });
        expect(client.post).toHaveBeenCalledWith('/marketing/images', expect.any(FormData));
      });
    });

    describe('delete', () => {
      it('should call DELETE /marketing/images/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await marketingApi.images.delete('img1');
        expect(client.delete).toHaveBeenCalledWith('/marketing/images/img1');
      });
    });
  });

  // ─── socialContent ─────────────────────────────────────────────
  describe('socialContent', () => {
    describe('list', () => {
      it('should call GET /marketing/social-content', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.socialContent.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/social-content', { params: undefined });
      });

      it('should pass filter params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.socialContent.list({ platform: 'instagram', status: 'posted' });
        expect(client.get).toHaveBeenCalledWith('/marketing/social-content', { params: { platform: 'instagram', status: 'posted' } });
      });
    });

    describe('create', () => {
      it('should call POST /marketing/social-content', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'sc1' } });
        await marketingApi.socialContent.create({ platform: 'facebook', content: 'Check out our deals!' });
        expect(client.post).toHaveBeenCalledWith('/marketing/social-content', { platform: 'facebook', content: 'Check out our deals!' });
      });
    });

    describe('update', () => {
      it('should call PUT /marketing/social-content/:id', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'sc1' } });
        await marketingApi.socialContent.update('sc1', { content: 'Updated post' });
        expect(client.put).toHaveBeenCalledWith('/marketing/social-content/sc1', { content: 'Updated post' });
      });
    });

    describe('delete', () => {
      it('should call DELETE /marketing/social-content/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await marketingApi.socialContent.delete('sc1');
        expect(client.delete).toHaveBeenCalledWith('/marketing/social-content/sc1');
      });
    });
  });

  // ─── optOut ────────────────────────────────────────────────────
  describe('optOut', () => {
    it('should call POST /marketing/opt-out', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Opted out' } });
      await marketingApi.optOut({ email: 'user@test.com', reason: 'Too many emails' });
      expect(client.post).toHaveBeenCalledWith('/marketing/opt-out', { email: 'user@test.com', reason: 'Too many emails' });
    });

    it('should accept phone', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Opted out' } });
      await marketingApi.optOut({ phone: '+91999' });
      expect(client.post).toHaveBeenCalledWith('/marketing/opt-out', { phone: '+91999' });
    });

    it('should return success message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Success' } });
      const result = await marketingApi.optOut({ email: 'test@test.com' });
      expect(result.data.message).toBeTruthy();
    });
  });

  // ─── optedOut ──────────────────────────────────────────────────
  describe('optedOut', () => {
    describe('list', () => {
      it('should call GET /contacts with opted_out=true', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.optedOut.list();
        expect(client.get).toHaveBeenCalledWith('/contacts', { params: { opted_out: true } });
      });

      it('should pass additional params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.optedOut.list({ page: 1, limit: 20, search: 'john' });
        expect(client.get).toHaveBeenCalledWith('/contacts', { params: { page: 1, limit: 20, search: 'john', opted_out: true } });
      });
    });

    describe('resubscribe', () => {
      it('should call PUT /contacts/:id to clear opt-out fields', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { message: 'Resubscribed' } });
        await marketingApi.optedOut.resubscribe('c1');
        expect(client.put).toHaveBeenCalledWith('/contacts/c1', { optedOut: 0, optedOutAt: null, optOutChannel: null, optOutReason: null });
      });
    });
  });

  // ─── festivals ─────────────────────────────────────────────────
  describe('festivals', () => {
    describe('list', () => {
      it('should call GET /marketing/festivals', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.festivals.list();
        expect(client.get).toHaveBeenCalledWith('/marketing/festivals', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
        await marketingApi.festivals.list({ page: 1, limit: 10, search: 'diwali' });
        expect(client.get).toHaveBeenCalledWith('/marketing/festivals', { params: { page: 1, limit: 10, search: 'diwali' } });
      });
    });

    describe('activate', () => {
      it('should call PUT /marketing/festivals/:id/activate', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'fc1', isActive: true } });
        await marketingApi.festivals.activate('fc1');
        expect(client.put).toHaveBeenCalledWith('/marketing/festivals/fc1/activate', {});
      });
    });

    describe('deactivate', () => {
      it('should call PUT /marketing/festivals/:id/deactivate', async () => {
        vi.mocked(client.put).mockResolvedValue({ data: { id: 'fc1', isActive: false } });
        await marketingApi.festivals.deactivate('fc1');
        expect(client.put).toHaveBeenCalledWith('/marketing/festivals/fc1/deactivate', {});
      });
    });

    describe('delete', () => {
      it('should call DELETE /marketing/festivals/:id', async () => {
        vi.mocked(client.delete).mockResolvedValue({ data: undefined });
        await marketingApi.festivals.delete('fc1');
        expect(client.delete).toHaveBeenCalledWith('/marketing/festivals/fc1');
      });
    });
  });
});
