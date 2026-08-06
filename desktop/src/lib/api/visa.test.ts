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
import { visaApi, travellersApi } from './visa';

describe('visaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /visa', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await visaApi.list();
      expect(client.get).toHaveBeenCalledWith('/visa', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await visaApi.list({ status: 'approved', countryName: 'USA' });
      expect(client.get).toHaveBeenCalledWith('/visa', { params: { status: 'approved', countryName: 'USA' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await visaApi.list({ page: 2, limit: 10, sortBy: 'applicationDate', sortOrder: 'desc' });
      expect(client.get).toHaveBeenCalledWith('/visa', { params: { page: 2, limit: 10, sortBy: 'applicationDate', sortOrder: 'desc' } });
    });
  });

  describe('getById', () => {
    it('should call GET /visa/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'v1', travellerName: 'John' } });
      const result = await visaApi.getById('v1');
      expect(client.get).toHaveBeenCalledWith('/visa/v1');
      expect(result.data.travellerName).toBe('John');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await visaApi.getById('visa-abc');
      expect(client.get).toHaveBeenCalledWith('/visa/visa-abc');
    });
  });

  describe('create', () => {
    it('should call POST /visa', async () => {
      const data = { passportNumber: 'P123', travellerName: 'John Doe', countryName: 'USA' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v1' } });
      await visaApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/visa', data);
    });

    it('should pass all optional fields', async () => {
      const data = { passportNumber: 'P456', travellerName: 'Jane', countryName: 'UK', visaType: 'tourist', applicationDate: '2026-03-01', status: 'applied' as const, notes: 'Urgent' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v2' } });
      await visaApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/visa', data);
    });

    it('should return created visa record', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'v3' } });
      const result = await visaApi.create({ passportNumber: 'P789', travellerName: 'Test', countryName: 'Japan' });
      expect(result.data.id).toBe('v3');
    });
  });

  describe('update', () => {
    it('should call PUT /visa/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'v1' } });
      await visaApi.update('v1', { status: 'approved' });
      expect(client.put).toHaveBeenCalledWith('/visa/v1', { status: 'approved' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await visaApi.update('v1', { expiryDate: '2027-03-01', notes: 'Updated' });
      expect(client.put).toHaveBeenCalledWith('/visa/v1', { expiryDate: '2027-03-01', notes: 'Updated' });
    });
  });

  describe('delete', () => {
    it('should call DELETE /visa/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await visaApi.delete('v1');
      expect(client.delete).toHaveBeenCalledWith('/visa/v1');
    });
  });

  describe('getChecklist', () => {
    it('should call GET /visa/:id/checklist/', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await visaApi.getChecklist('v1');
      expect(client.get).toHaveBeenCalledWith('/visa/v1/checklist/', { params: {} });
    });

    it('should return checklist items', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'ci1', item: 'Passport copy', completed: false }] });
      const result = await visaApi.getChecklist('v1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('updateChecklistItem', () => {
    it('should call PATCH /visa/:id/checklist/:itemId', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 'ci1', completed: true } });
      await visaApi.updateChecklistItem('v1', 'ci1', { completed: true });
      expect(client.patch).toHaveBeenCalledWith('/visa/v1/checklist/ci1', { completed: true });
    });
  });

  describe('getNotes', () => {
    it('should call GET /visa/:id/notes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { notes: 'Some notes' } });
      await visaApi.getNotes('v1');
      expect(client.get).toHaveBeenCalledWith('/visa/v1/notes');
    });
  });

  describe('updateNotes', () => {
    it('should call PUT /visa/:id/notes', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { notes: 'Updated notes' } });
      await visaApi.updateNotes('v1', { notes: 'Updated notes' });
      expect(client.put).toHaveBeenCalledWith('/visa/v1/notes', { notes: 'Updated notes' });
    });
  });

  describe('getDocuments', () => {
    it('should call GET /visa/:id/documents', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await visaApi.getDocuments('v1');
      expect(client.get).toHaveBeenCalledWith('/visa/v1/documents');
    });
  });

  describe('uploadDocument', () => {
    it('should call POST /visa/:id/documents with FormData', async () => {
      const file = new File(['content'], 'passport.pdf');
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'doc1' } });
      await visaApi.uploadDocument('v1', file, 'passport');
      expect(client.post).toHaveBeenCalledWith('/visa/v1/documents', expect.any(FormData));
    });
  });

  describe('downloadDocument', () => {
    it('should call GET /visa/:id/documents/:docId/download with blob', async () => {
      vi.mocked(client.get).mockResolvedValue(new Blob());
      await visaApi.downloadDocument('v1', 'doc1');
      expect(client.get).toHaveBeenCalledWith('/visa/v1/documents/doc1/download', { responseType: 'blob' });
    });
  });

  describe('deleteDocument', () => {
    it('should call DELETE /visa/:id/documents/:docId', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await visaApi.deleteDocument('v1', 'doc1');
      expect(client.delete).toHaveBeenCalledWith('/visa/v1/documents/doc1');
    });
  });
});

describe('travellersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /travellers', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await travellersApi.list();
      expect(client.get).toHaveBeenCalledWith('/travellers', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await travellersApi.list({ leadId: 'l1', search: 'John' });
      expect(client.get).toHaveBeenCalledWith('/travellers', { params: { leadId: 'l1', search: 'John' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await travellersApi.list({ page: 2, limit: 10, sortBy: 'firstName', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/travellers', { params: { page: 2, limit: 10, sortBy: 'firstName', sortOrder: 'asc' } });
    });
  });

  describe('getById', () => {
    it('should call GET /travellers/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'tr1', firstName: 'John' } });
      const result = await travellersApi.getById('tr1');
      expect(client.get).toHaveBeenCalledWith('/travellers/tr1');
      expect(result.data.firstName).toBe('John');
    });
  });

  describe('create', () => {
    it('should call POST /travellers', async () => {
      const data = { firstName: 'John', lastName: 'Doe', passportNumber: 'P123' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'tr1' } });
      await travellersApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/travellers', data);
    });

    it('should pass all optional fields', async () => {
      const data = { firstName: 'Jane', lastName: 'Doe', passportNumber: 'P456', dateOfBirth: '1990-05-15', nationality: 'Indian', email: 'jane@test.com', phone: '+91999', leadId: 'l1', contactId: 'c1' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'tr2' } });
      await travellersApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/travellers', data);
    });
  });

  describe('update', () => {
    it('should call PUT /travellers/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'tr1' } });
      await travellersApi.update('tr1', { firstName: 'Updated' });
      expect(client.put).toHaveBeenCalledWith('/travellers/tr1', { firstName: 'Updated' });
    });
  });

  describe('delete', () => {
    it('should call DELETE /travellers/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await travellersApi.delete('tr1');
      expect(client.delete).toHaveBeenCalledWith('/travellers/tr1');
    });
  });
});
