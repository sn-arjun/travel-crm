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
import { leadsApi } from './leads';

describe('leadsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── list ──────────────────────────────────────────────────────
  describe('list', () => {
    it('should call GET /leads with no params', async () => {
      const mockResponse = { data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } };
      vi.mocked(client.get).mockResolvedValue(mockResponse);

      const result = await leadsApi.list();

      expect(client.get).toHaveBeenCalledWith('/leads', { params: undefined });
      expect(result).toEqual(mockResponse);
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.list({ page: 3, limit: 25 });

      expect(client.get).toHaveBeenCalledWith('/leads', { params: { page: 3, limit: 25 } });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.list({ status: 'new', source: 'website', assignedTo: 'u1' });

      expect(client.get).toHaveBeenCalledWith('/leads', {
        params: { status: 'new', source: 'website', assignedTo: 'u1' },
      });
    });

    it('should pass search param', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.list({ search: 'Maldives' });

      expect(client.get).toHaveBeenCalledWith('/leads', { params: { search: 'Maldives' } });
    });

    it('should pass sorting params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.list({ sortBy: 'createdAt', sortOrder: 'desc' });

      expect(client.get).toHaveBeenCalledWith('/leads', { params: { sortBy: 'createdAt', sortOrder: 'desc' } });
    });
  });

  // ─── getById ───────────────────────────────────────────────────
  describe('getById', () => {
    it('should call GET /leads/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 'l1', title: 'Bali Trip' } });

      const result = await leadsApi.getById('l1');

      expect(client.get).toHaveBeenCalledWith('/leads/l1');
      expect(result.data.id).toBe('l1');
    });

    it('should return lead data with all fields', async () => {
      const lead = { id: 'l1', title: 'Bali Trip', status: 'new', contactId: 'c1' };
      vi.mocked(client.get).mockResolvedValue({ data: lead });

      const result = await leadsApi.getById('l1');

      expect(result.data).toEqual(lead);
    });

    it('should use the correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await leadsApi.getById('lead-xyz');

      expect(client.get).toHaveBeenCalledWith('/leads/lead-xyz');
    });
  });

  // ─── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('should call POST /leads with data', async () => {
      const data = {
        contactId: 'c1',
        title: 'Bali Trip',
        destinations: ['Bali'],
        travelDate: '2026-06-01',
        tripType: 'honeymoon' as const,
        source: 'website' as const,
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'l1', ...data } });

      const result = await leadsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/leads', data);
      expect(result.data.id).toBe('l1');
    });

    it('should pass all optional fields', async () => {
      const data = {
        contactId: 'c1',
        title: 'Group Trip',
        destinations: ['Thailand', 'Singapore'],
        travelDate: '2026-07-01',
        returnDate: '2026-07-10',
        tripType: 'group' as const,
        source: 'manual' as const,
        paxAdults: 4,
        paxChildren: 2,
        budget: 50000,
        priority: 'hot' as const,
        assignedTo: 'u1',
        specialRequirements: 'Vegetarian meals',
        notes: 'Corporate group',
      };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'l2' } });

      await leadsApi.create(data);

      expect(client.post).toHaveBeenCalledWith('/leads', data);
    });

    it('should return created lead', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'l3', title: 'New Lead' } });

      const result = await leadsApi.create({
        contactId: 'c1',
        title: 'New Lead',
        destinations: ['Paris'],
        travelDate: '2026-08-01',
        tripType: 'family' as const,
        source: 'referral' as const,
      });

      expect(result.data.title).toBe('New Lead');
    });
  });

  // ─── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('should call PUT /leads/:id with data', async () => {
      const data = { status: 'qualified' };
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'l1' } });

      await leadsApi.update('l1', data);

      expect(client.put).toHaveBeenCalledWith('/leads/l1', data);
    });

    it('should pass partial update fields', async () => {
      const data = { assignedTo: 'u2', notes: 'Reassigned' };
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await leadsApi.update('l1', data);

      expect(client.put).toHaveBeenCalledWith('/leads/l1', data);
    });

    it('should return updated lead', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'l1', status: 'qualified' } });

      const result = await leadsApi.update('l1', { status: 'qualified' });

      expect(result.data.status).toBe('qualified');
    });
  });

  // ─── delete ────────────────────────────────────────────────────
  describe('delete', () => {
    it('should call DELETE /leads/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await leadsApi.delete('l1');

      expect(client.delete).toHaveBeenCalledWith('/leads/l1');
    });

    it('should pass the correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      await leadsApi.delete('lead-999');

      expect(client.delete).toHaveBeenCalledWith('/leads/lead-999');
    });

    it('should return void response', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });

      const result = await leadsApi.delete('l1');

      expect(result).toEqual({ data: undefined });
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────
  describe('updateStatus', () => {
    it('should call PUT /leads/:id/status', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'l1', status: 'won' } });

      await leadsApi.updateStatus('l1', { status: 'won' });

      expect(client.put).toHaveBeenCalledWith('/leads/l1/status', { status: 'won' });
    });

    it('should pass reason when provided', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });

      await leadsApi.updateStatus('l1', { status: 'lost', reason: 'Budget too low' });

      expect(client.put).toHaveBeenCalledWith('/leads/l1/status', { status: 'lost', reason: 'Budget too low' });
    });

    it('should return updated lead', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'l1', status: 'qualified' } });

      const result = await leadsApi.updateStatus('l1', { status: 'qualified' });

      expect(result.data.status).toBe('qualified');
    });
  });

  // ─── assign ────────────────────────────────────────────────────
  describe('assign', () => {
    it('should call POST /leads/:id/assign', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'l1' } });

      await leadsApi.assign('l1', { userId: 'u2' });

      expect(client.post).toHaveBeenCalledWith('/leads/l1/assign', { userId: 'u2' });
    });

    it('should pass optional note', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await leadsApi.assign('l1', { userId: 'u2', note: 'Handle with care' });

      expect(client.post).toHaveBeenCalledWith('/leads/l1/assign', { userId: 'u2', note: 'Handle with care' });
    });

    it('should return assigned lead', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'l1', assignedTo: 'u2' } });

      const result = await leadsApi.assign('l1', { userId: 'u2' });

      expect(result.data.assignedTo).toBe('u2');
    });
  });

  // ─── getActivities ─────────────────────────────────────────────
  describe('getActivities', () => {
    it('should call GET /leads/:id/activities', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getActivities('l1');

      expect(client.get).toHaveBeenCalledWith('/leads/l1/activities', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getActivities('l1', { page: 2, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/leads/l1/activities', { params: { page: 2, limit: 10 } });
    });

    it('should return paginated activities', async () => {
      const mock = { data: { data: [{ id: 'a1', type: 'note', description: 'Added note' }], pagination: { page: 1 } } };
      vi.mocked(client.get).mockResolvedValue(mock);

      const result = await leadsApi.getActivities('l1');

      expect(result.data.data).toHaveLength(1);
    });
  });

  // ─── getNotes ──────────────────────────────────────────────────
  describe('getNotes', () => {
    it('should call GET /leads/:id/notes', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getNotes('l1');

      expect(client.get).toHaveBeenCalledWith('/leads/l1/notes', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getNotes('l1', { page: 1, limit: 5 });

      expect(client.get).toHaveBeenCalledWith('/leads/l1/notes', { params: { page: 1, limit: 5 } });
    });

    it('should return notes list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'n1', content: 'A note' }], pagination: {} } });

      const result = await leadsApi.getNotes('l1');

      expect(result.data[0]?.content).toBe('A note');
    });
  });

  // ─── getFollowUps ─────────────────────────────────────────────
  describe('getFollowUps', () => {
    it('should call GET /leads/:id/follow-ups', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await leadsApi.getFollowUps('l1');

      expect(client.get).toHaveBeenCalledWith('/leads/l1/follow-ups', { params: undefined });
    });

    it('should pass status filter', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });

      await leadsApi.getFollowUps('l1', { status: 'pending' });

      expect(client.get).toHaveBeenCalledWith('/leads/l1/follow-ups', { params: { status: 'pending' } });
    });

    it('should return follow-ups array', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'f1', title: 'Call back', status: 'pending' }] });

      const result = await leadsApi.getFollowUps('l1');

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── createNote ────────────────────────────────────────────────
  describe('createNote', () => {
    it('should call POST /leads/:id/notes', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'n1', content: 'New note' } });

      await leadsApi.createNote('l1', { content: 'New note' });

      expect(client.post).toHaveBeenCalledWith('/leads/l1/notes', { content: 'New note' });
    });

    it('should return created note', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'n1', content: 'My note', createdAt: '2026-01-01' } });

      const result = await leadsApi.createNote('l1', { content: 'My note' });

      expect(result.data.id).toBe('n1');
    });

    it('should use the correct lead id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await leadsApi.createNote('lead-abc', { content: 'test' });

      expect(client.post).toHaveBeenCalledWith('/leads/lead-abc/notes', { content: 'test' });
    });
  });

  // ─── createFollowUp ───────────────────────────────────────────
  describe('createFollowUp', () => {
    it('should call POST /leads/:id/follow-ups', async () => {
      const data = { title: 'Call client', dueDate: '2026-03-15' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'f1' } });

      await leadsApi.createFollowUp('l1', data);

      expect(client.post).toHaveBeenCalledWith('/leads/l1/follow-ups', data);
    });

    it('should pass all optional fields', async () => {
      const data = { title: 'Meeting', dueDate: '2026-03-20', type: 'meeting', priority: 'high', description: 'Discuss budget' };
      vi.mocked(client.post).mockResolvedValue({ data: {} });

      await leadsApi.createFollowUp('l1', data);

      expect(client.post).toHaveBeenCalledWith('/leads/l1/follow-ups', data);
    });

    it('should return created follow-up', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'f1', title: 'Follow up' } });

      const result = await leadsApi.createFollowUp('l1', { title: 'Follow up', dueDate: '2026-04-01' });

      expect(result.data.id).toBe('f1');
    });
  });

  // ─── bulkAssign ────────────────────────────────────────────────
  describe('bulkAssign', () => {
    it('should call POST /leads/bulk-assign', async () => {
      const data = { leadIds: ['l1', 'l2'], assignedTo: 'u1' };
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 2 } });

      const result = await leadsApi.bulkAssign(data);

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-assign', data);
      expect(result.data.updated).toBe(2);
    });

    it('should handle single lead assignment', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 1 } });

      await leadsApi.bulkAssign({ leadIds: ['l1'], assignedTo: 'u2' });

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-assign', { leadIds: ['l1'], assignedTo: 'u2' });
    });

    it('should return updated count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 5 } });

      const result = await leadsApi.bulkAssign({ leadIds: ['l1', 'l2', 'l3', 'l4', 'l5'], assignedTo: 'u1' });

      expect(result.data.updated).toBe(5);
    });
  });

  // ─── bulkUpdateStatus ──────────────────────────────────────────
  describe('bulkUpdateStatus', () => {
    it('should call POST /leads/bulk-status', async () => {
      const data = { leadIds: ['l1', 'l2'], status: 'lost' };
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 2 } });

      await leadsApi.bulkUpdateStatus(data);

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-status', data);
    });

    it('should pass reason when provided', async () => {
      const data = { leadIds: ['l1'], status: 'lost', reason: 'No budget' };
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 1 } });

      await leadsApi.bulkUpdateStatus(data);

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-status', data);
    });

    it('should return updated count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { updated: 3 } });

      const result = await leadsApi.bulkUpdateStatus({ leadIds: ['l1', 'l2', 'l3'], status: 'qualified' });

      expect(result.data.updated).toBe(3);
    });
  });

  // ─── bulkDelete ────────────────────────────────────────────────
  describe('bulkDelete', () => {
    it('should call POST /leads/bulk-delete', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { deleted: 2 } });

      await leadsApi.bulkDelete({ leadIds: ['l1', 'l2'] });

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-delete', { leadIds: ['l1', 'l2'] });
    });

    it('should return deleted count', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { deleted: 3 } });

      const result = await leadsApi.bulkDelete({ leadIds: ['l1', 'l2', 'l3'] });

      expect(result.data.deleted).toBe(3);
    });

    it('should handle single lead deletion', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { deleted: 1 } });

      await leadsApi.bulkDelete({ leadIds: ['l1'] });

      expect(client.post).toHaveBeenCalledWith('/leads/bulk-delete', { leadIds: ['l1'] });
    });
  });

  // ─── getFilterOptions ──────────────────────────────────────────
  describe('getFilterOptions', () => {
    it('should call GET /leads/filter-options', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });

      await leadsApi.getFilterOptions();

      expect(client.get).toHaveBeenCalledWith('/leads/filter-options');
    });
  });

  // ─── getUnassigned ─────────────────────────────────────────────
  describe('getUnassigned', () => {
    it('should call GET /leads/unassigned', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getUnassigned();

      expect(client.get).toHaveBeenCalledWith('/leads/unassigned', { params: undefined });
    });

    it('should pass pagination params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });

      await leadsApi.getUnassigned({ page: 1, limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/leads/unassigned', { params: { page: 1, limit: 10 } });
    });
  });
});

describe('leadsApi note normalisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getNotes camelizes created_by_name / created_at so the page can render author and date', async () => {
    vi.mocked(client.get).mockResolvedValue({
      success: true,
      data: [{ id: 'n1', content: 'Called the client', created_by: 'u1', created_by_name: 'Asha Rao', created_at: '2026-03-04T10:00:00Z' }],
    });
    const result = await leadsApi.getNotes('l1');
    expect(result.data[0]).toMatchObject({
      id: 'n1', createdBy: 'u1', createdByName: 'Asha Rao', createdAt: '2026-03-04T10:00:00Z',
    });
    expect(Number.isNaN(new Date(result.data[0]!.createdAt).getTime())).toBe(false);
    expect(result.pagination.total).toBe(1);
  });

  it('createNote unwraps and camelizes the created note', async () => {
    vi.mocked(client.post).mockResolvedValue({ success: true, data: { id: 'n2', content: 'Hi', created_by: 'u1' } });
    const result = await leadsApi.createNote('l1', { content: 'Hi' });
    expect(result.data).toMatchObject({ id: 'n2', createdBy: 'u1' });
  });
});
