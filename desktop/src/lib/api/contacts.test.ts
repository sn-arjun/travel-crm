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
import { contactsApi } from './contacts';

describe('contactsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /contacts with no params', async () => {
      const mockResponse = { data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } };
      vi.mocked(client.get).mockResolvedValue(mockResponse);

      const result = await contactsApi.list();

      expect(client.get).toHaveBeenCalledWith('/contacts', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should pass page and limit params', async () => {
      const mockResponse = { data: { data: [], pagination: { page: 2, limit: 10, total: 50, totalPages: 5 } } };
      vi.mocked(client.get).mockResolvedValue(mockResponse);

      await contactsApi.list({ page: 2, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/contacts', { params: { page: 2, limit: 10 } });
    });

    it('should pass search and type filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await contactsApi.list({ search: 'john', type: 'customer' });

      expect(client.get).toHaveBeenCalledWith('/contacts', { params: { search: 'john', type: 'customer' } });
    });

    it('should pass sorting params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await contactsApi.list({ sortBy: 'name', sortOrder: 'asc' });

      expect(client.get).toHaveBeenCalledWith('/contacts', { params: { sortBy: 'name', sortOrder: 'asc' } });
    });

    it('should pass tag filter param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await contactsApi.list({ tag: 'vip' });

      expect(client.get).toHaveBeenCalledWith('/contacts', { params: { tag: 'vip' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /contacts/:id', async () => {
      const mockContact = { data: { id: 'c1', name: 'John Doe' } };
      vi.mocked(client.get).mockResolvedValue(mockContact);

      const result = await contactsApi.getById('c1');

      expect(client.get).toHaveBeenCalledWith('/contacts/c1');
      expect(result).toEqual(mockContact);
    });

    it('should pass the correct id in the URL', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await contactsApi.getById('abc-123');

      expect(client.get).toHaveBeenCalledWith('/contacts/abc-123');
    });

    it('should return the contact data', async () => {
      const expected = { data: { id: 'c1', name: 'Jane', email: 'jane@test.com' } };
      vi.mocked(client.get).mockResolvedValue(expected);

      const result = await contactsApi.getById('c1');

      expect(result.data).toEqual(expected.data);
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /contacts with data', async () => {
      const data = { name: 'New Contact', type: 'customer' as const };
      const mockResponse = { data: { id: 'c1', ...data } };
      vi.mocked(client.post).mockResolvedValue(mockResponse);

      const result = await contactsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/contacts', data);
      expect(result).toEqual(mockResponse);
    });

    it('should pass all optional fields', async () => {
      const data = {
        name: 'Full Contact',
        type: 'supplier' as const,
        email: 'test@test.com',
        phone: '+1234567890',
        company: 'Acme',
        city: 'Mumbai',
        tags: ['vip'],
        notes: 'Important client',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'c2', ...data } });

      await contactsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/contacts', data);
    });

    it('should return created contact', async () => {
      const data = { name: 'Test', type: 'agent' as const };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'c3', name: 'Test', type: 'agent' } });

      const result = await contactsApi.create(data);

      expect(result.data.id).toBe('c3');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /contacts/:id with data', async () => {
      const data = { name: 'Updated Name' };
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'c1', name: 'Updated Name' } });

      await contactsApi.update('c1', data);

      expect(client.put).toHaveBeenCalledWith('/contacts/c1', data);
    });

    it('should pass partial update fields', async () => {
      const data = { email: 'new@email.com', phone: '+999' };
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await contactsApi.update('c1', data);

      expect(client.put).toHaveBeenCalledWith('/contacts/c1', data);
    });

    it('should return updated contact', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'c1', name: 'Updated' } });

      const result = await contactsApi.update('c1', { name: 'Updated' });

      expect(result.data.name).toBe('Updated');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /contacts/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await contactsApi.delete('c1');

      expect(client.delete).toHaveBeenCalledWith('/contacts/c1');
    });

    it('should pass correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await contactsApi.delete('xyz-789');

      expect(client.delete).toHaveBeenCalledWith('/contacts/xyz-789');
    });

    it('should return void response', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await contactsApi.delete('c1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── getTimeline ───────────────────────────────────────────────
  describe('getTimeline', () => {
    it('should call GET /contacts/:id/timeline', async () => {
      const mockTimeline = { data: [{ id: 't1', type: 'email', description: 'Sent email', createdAt: '2026-01-01' }] };
      vi.mocked(client.get).mockResolvedValue(mockTimeline);

      const result = await contactsApi.getTimeline('c1');

      expect(client.get).toHaveBeenCalledWith('/contacts/c1/timeline');
      expect(result).toEqual(mockTimeline);
    });

    it('should return timeline array', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ id: 't1' }, { id: 't2' }] });

      const result = await contactsApi.getTimeline('c1');

      expect(result.data).toHaveLength(2);
    });

    it('should use correct contact id in URL', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await contactsApi.getTimeline('contact-abc');

      expect(client.get).toHaveBeenCalledWith('/contacts/contact-abc/timeline');
    });
  });

  // ─── getTags ───────────────────────────────────────────────────
  describe('getTags', () => {
    it('should call GET /contacts/tags', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: ['vip', 'corporate'] });

      const result = await contactsApi.getTags();

      expect(client.get).toHaveBeenCalledWith('/contacts/tags');
      expect(result.data).toEqual(['vip', 'corporate']);
    });

    it('should return empty array when no tags', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      const result = await contactsApi.getTags();

      expect(result.data).toEqual([]);
    });

    it('should not require any parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await contactsApi.getTags();

      expect(client.get).toHaveBeenCalledTimes(1);
      expect(client.get).toHaveBeenCalledWith('/contacts/tags');
    });
  });

  // ─── checkDuplicate ────────────────────────────────────────────
  describe('checkDuplicate', () => {
    it('should call POST /contacts/check-duplicate', async () => {
      const data = { email: 'test@test.com' };
      vi.mocked(client.post).mockResolvedValue({ data: [] });

      await contactsApi.checkDuplicate(data);

      expect(client.post).toHaveBeenCalledWith('/contacts/check-duplicate', data);
    });

    it('should pass phone for duplicate check', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: [] });

      await contactsApi.checkDuplicate({ phone: '+1234567890' });

      expect(client.post).toHaveBeenCalledWith('/contacts/check-duplicate', { phone: '+1234567890' });
    });

    it('should return duplicate contacts with match scores', async () => {
      const duplicates = [{ id: 'c1', name: 'John', matchScore: 0.95 }];
      vi.mocked(client.post).mockResolvedValue({ data: duplicates });

      const result = await contactsApi.checkDuplicate({ name: 'John' });

      expect(result.data).toEqual(duplicates);
    });

    it('should accept name as check criteria', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: [] });

      await contactsApi.checkDuplicate({ name: 'John Doe' });

      expect(client.post).toHaveBeenCalledWith('/contacts/check-duplicate', { name: 'John Doe' });
    });
  });

  // ─── merge ─────────────────────────────────────────────────────
  describe('merge', () => {
    it('should call POST /contacts/merge', async () => {
      const data = { primaryId: 'c1', secondaryId: 'c2' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'c1' } });

      await contactsApi.merge(data);

      expect(client.post).toHaveBeenCalledWith('/contacts/merge', data);
    });

    it('should pass mergeFields when provided', async () => {
      const data = { primaryId: 'c1', secondaryId: 'c2', mergeFields: { email: 'secondary' as const } };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'c1' } });

      await contactsApi.merge(data);

      expect(client.post).toHaveBeenCalledWith('/contacts/merge', data);
    });

    it('should return merged contact', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'c1', name: 'Merged Contact' } });

      const result = await contactsApi.merge({ primaryId: 'c1', secondaryId: 'c2' });

      expect(result.data.id).toBe('c1');
    });
  });

  // ─── share ─────────────────────────────────────────────────────
  describe('share', () => {
    it('should call POST /contacts/:id/share', async () => {
      const data = { userId: 'u1' };
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Shared' } });

      await contactsApi.share('c1', data);

      expect(client.post).toHaveBeenCalledWith('/contacts/c1/share', data);
    });

    it('should pass optional note', async () => {
      const data = { userId: 'u1', note: 'Check this contact' };
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Shared' } });

      await contactsApi.share('c1', data);

      expect(client.post).toHaveBeenCalledWith('/contacts/c1/share', data);
    });

    it('should return success message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { message: 'Contact shared successfully' } });

      const result = await contactsApi.share('c1', { userId: 'u1' });

      expect(result.data.message).toBeTruthy();
    });
  });

  // ─── export ────────────────────────────────────────────────────
  describe('export', () => {
    it('should call GET /contacts/export with blob responseType', async () => {
      const blob = new Blob(['csv-data']);
      vi.mocked(client.get).mockResolvedValue(blob);

      await contactsApi.export();

      expect(client.get).toHaveBeenCalledWith('/contacts/export', { params: undefined, responseType: 'blob' });
    });

    it('should pass format param', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());

      await contactsApi.export({ format: 'xlsx' });

      expect(client.get).toHaveBeenCalledWith('/contacts/export', {
        params: { format: 'xlsx' },
        responseType: 'blob',
      });
    });

    it('should return blob data', async () => {
      const blob = new Blob(['data']);
      vi.mocked(client.get).mockResolvedValue(blob);

      const result = await contactsApi.export();

      expect(result).toBeInstanceOf(Blob);
    });
  });

  // ─── getFilterOptions ──────────────────────────────────────────
  describe('getFilterOptions', () => {
    it('should call GET /contacts/filter-options', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await contactsApi.getFilterOptions();

      expect(client.get).toHaveBeenCalledWith('/contacts/filter-options');
    });
  });

  // ─── getMergePreview ───────────────────────────────────────────
  describe('getMergePreview', () => {
    it('should call GET /contacts/merge/preview with IDs', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await contactsApi.getMergePreview('c1', 'c2');

      expect(client.get).toHaveBeenCalledWith('/contacts/merge/preview', {
        params: { primaryId: 'c1', secondaryId: 'c2' },
      });
    });
  });

  // ─── getUpcomingOccasions ──────────────────────────────────────
  describe('getUpcomingOccasions', () => {
    it('should call GET /contacts/upcoming-occasions', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await contactsApi.getUpcomingOccasions({ days: 30, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/contacts/upcoming-occasions', { params: { days: 30, limit: 10 } });
    });
  });

  // ─── getCustomFields ──────────────────────────────────────────
  describe('getCustomFields', () => {
    it('should call GET /contacts/custom-fields', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await contactsApi.getCustomFields();

      expect(client.get).toHaveBeenCalledWith('/contacts/custom-fields');
    });
  });
});
