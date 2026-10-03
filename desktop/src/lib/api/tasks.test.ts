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
import { tasksApi } from './tasks';

describe('tasksApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('should call GET /tasks with no params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.list();
      expect(client.get).toHaveBeenCalledWith('/tasks', { params: undefined });
    });

    it('should pass filter params', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.list({ status: 'todo', priority: 'high', category: 'follow_up' });
      expect(client.get).toHaveBeenCalledWith('/tasks', { params: { status: 'todo', priority: 'high', category: 'follow_up' } });
    });

    it('should pass pagination and sort', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.list({ page: 2, limit: 10, sortBy: 'dueDate', sortOrder: 'asc' });
      expect(client.get).toHaveBeenCalledWith('/tasks', { params: { page: 2, limit: 10, sortBy: 'dueDate', sortOrder: 'asc' } });
    });

    it('should pass assignedTo and leadId', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.list({ assignedTo: 'u1', leadId: 'l1' });
      expect(client.get).toHaveBeenCalledWith('/tasks', { params: { assignedTo: 'u1', leadId: 'l1' } });
    });
  });

  describe('getById', () => {
    it('should call GET /tasks/:id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', title: 'Call client' } });
      const result = await tasksApi.getById('t1');
      expect(client.get).toHaveBeenCalledWith('/tasks/t1');
      expect(result.data.title).toBe('Call client');
    });

    it('should use correct id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await tasksApi.getById('task-abc');
      expect(client.get).toHaveBeenCalledWith('/tasks/task-abc');
    });

    it('should return task data', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { id: 't1', status: 'in_progress', priority: 'high' } });
      const result = await tasksApi.getById('t1');
      expect(result.data.status).toBe('in_progress');
    });
  });

  describe('create', () => {
    it('should call POST /tasks', async () => {
      const data = { title: 'New Task' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't1' } });
      await tasksApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/tasks', data);
    });

    it('should pass all optional fields', async () => {
      const data = { title: 'Full Task', description: 'Desc', priority: 'high' as const, category: 'meeting', status: 'todo' as const, due_date: '2026-04-01', assigned_to: 'u1', related_lead_id: 'l1' };
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't2' } });
      await tasksApi.create(data);
      expect(client.post).toHaveBeenCalledWith('/tasks', {
        title: 'Full Task', description: 'Desc', priority: 'high', category: 'meeting', status: 'todo',
        dueDate: '2026-04-01', due_date: '2026-04-01',
        assignedTo: 'u1', assigned_to: 'u1',
        relatedLeadId: 'l1', related_lead_id: 'l1',
      });
    });

    it('should send camelCase fields together with the snake_case keys the backend reads', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't2' } });
      await tasksApi.create({ title: 'Call client', dueDate: '2026-04-01', assignedTo: 'u1', relatedLeadId: 'l1', parentTaskId: 'p1' });
      expect(client.post).toHaveBeenCalledWith('/tasks', {
        title: 'Call client',
        dueDate: '2026-04-01', due_date: '2026-04-01',
        assignedTo: 'u1', assigned_to: 'u1',
        relatedLeadId: 'l1', related_lead_id: 'l1',
        parentTaskId: 'p1', parent_task_id: 'p1',
      });
    });

    it('should return a camelCase task from the { data } envelope', async () => {
      vi.mocked(client.post).mockResolvedValue({
        data: { id: 't9', due_date: '2026-04-01', assignee_name: 'Asha', lead_title: 'Goa trip', subtask_count: 2 },
      });
      const result = await tasksApi.create({ title: 'x' });
      expect(result.data).toMatchObject({ id: 't9', dueDate: '2026-04-01', assigneeName: 'Asha', leadTitle: 'Goa trip', subtaskCount: 2, completedSubtaskCount: 0 });
    });

    it('should return created task', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 't3', title: 'Created' } });
      const result = await tasksApi.create({ title: 'Created' });
      expect(result.data.id).toBe('t3');
    });
  });

  describe('update', () => {
    it('should call PUT /tasks/:id', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 't1' } });
      await tasksApi.update('t1', { title: 'Updated' });
      expect(client.put).toHaveBeenCalledWith('/tasks/t1', { title: 'Updated' });
    });

    it('should pass partial fields', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: {} });
      await tasksApi.update('t1', { priority: 'low', due_date: '2026-05-01' });
      expect(client.put).toHaveBeenCalledWith('/tasks/t1', { priority: 'low', dueDate: '2026-05-01', due_date: '2026-05-01' });
    });

    it('should return updated task', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 't1', title: 'Updated' } });
      const result = await tasksApi.update('t1', { title: 'Updated' });
      expect(result.data.title).toBe('Updated');
    });
  });

  describe('delete', () => {
    it('should call DELETE /tasks/:id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await tasksApi.delete('t1');
      expect(client.delete).toHaveBeenCalledWith('/tasks/t1');
    });

    it('should use correct id', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await tasksApi.delete('task-xyz');
      expect(client.delete).toHaveBeenCalledWith('/tasks/task-xyz');
    });

    it('should return void', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      const result = await tasksApi.delete('t1');
      expect(result).toEqual({ data: undefined });
    });
  });

  describe('updateStatus', () => {
    it('should call PATCH /tasks/:id/status', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 't1', status: 'done' } });
      await tasksApi.updateStatus('t1', { status: 'done' });
      expect(client.patch).toHaveBeenCalledWith('/tasks/t1/status', { status: 'done' });
    });

    it('should set status to in_progress', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: {} });
      await tasksApi.updateStatus('t1', { status: 'in_progress' });
      expect(client.patch).toHaveBeenCalledWith('/tasks/t1/status', { status: 'in_progress' });
    });

    it('should return updated task', async () => {
      vi.mocked(client.patch).mockResolvedValue({ data: { id: 't1', status: 'done' } });
      const result = await tasksApi.updateStatus('t1', { status: 'done' });
      expect(result.data.status).toBe('done');
    });
  });

  describe('getSubtasks', () => {
    it('should call GET /tasks/:id/subtasks', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await tasksApi.getSubtasks('t1');
      expect(client.get).toHaveBeenCalledWith('/tasks/t1/subtasks');
    });

    it('should return subtasks array', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [{ id: 'st1', title: 'Sub 1', status: 'todo' }] });
      const result = await tasksApi.getSubtasks('t1');
      expect(result.data).toHaveLength(1);
    });

    it('should use correct parent id', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: [] });
      await tasksApi.getSubtasks('parent-task');
      expect(client.get).toHaveBeenCalledWith('/tasks/parent-task/subtasks');
    });
  });

  describe('getComments', () => {
    it('should call GET /tasks/:id/comments', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.getComments('t1');
      expect(client.get).toHaveBeenCalledWith('/tasks/t1/comments', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.getComments('t1', { page: 1, limit: 20 });
      expect(client.get).toHaveBeenCalledWith('/tasks/t1/comments', { params: { page: 1, limit: 20 } });
    });

    it('should return comments list', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'cm1', content: 'Comment' }], pagination: {} } });
      const result = await tasksApi.getComments('t1');
      expect(result.data).toHaveLength(1);
    });
  });

  describe('createComment', () => {
    it('should call POST /tasks/:id/comments', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cm1' } });
      await tasksApi.createComment('t1', 'New comment');
      expect(client.post).toHaveBeenCalledWith('/tasks/t1/comments', { content: 'New comment' });
    });

    it('should return created comment', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { id: 'cm1', content: 'Test' } });
      const result = await tasksApi.createComment('t1', 'Test');
      expect(result.data.id).toBe('cm1');
    });

    it('should use correct task id', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await tasksApi.createComment('task-xyz', 'content');
      expect(client.post).toHaveBeenCalledWith('/tasks/task-xyz/comments', { content: 'content' });
    });
  });

  describe('updateComment', () => {
    it('should call PUT /tasks/:taskId/comments/:commentId', async () => {
      vi.mocked(client.put).mockResolvedValue({ data: { id: 'cm1' } });
      await tasksApi.updateComment('t1', 'cm1', 'Updated comment');
      expect(client.put).toHaveBeenCalledWith('/tasks/t1/comments/cm1', { content: 'Updated comment' });
    });
  });

  describe('deleteComment', () => {
    it('should call DELETE /tasks/:taskId/comments/:commentId', async () => {
      vi.mocked(client.delete).mockResolvedValue({ data: undefined });
      await tasksApi.deleteComment('t1', 'cm1');
      expect(client.delete).toHaveBeenCalledWith('/tasks/t1/comments/cm1');
    });
  });

  describe('getDashboardSummary', () => {
    it('should call GET /tasks/dashboard/summary', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { totalTasks: 50, completedTasks: 30, overdueTasks: 5 } });
      const result = await tasksApi.getDashboardSummary();
      expect(client.get).toHaveBeenCalledWith('/tasks/dashboard/summary');
      expect(result.data.totalTasks).toBe(50);
    });

    it('should return all summary fields', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { totalTasks: 0, completedTasks: 0, overdueTasks: 0, tasksByStatus: {}, tasksByPriority: {} } });
      const result = await tasksApi.getDashboardSummary();
      expect(result.data).toHaveProperty('totalTasks');
      expect(result.data).toHaveProperty('tasksByStatus');
    });

    it('should not require parameters', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: {} });
      await tasksApi.getDashboardSummary();
      expect(client.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('getByLead', () => {
    it('should call GET /tasks/leads/:leadId/tasks', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.getByLead('l1');
      expect(client.get).toHaveBeenCalledWith('/tasks/leads/l1/tasks', { params: undefined });
    });

    it('should pass pagination', async () => {
      vi.mocked(client.get).mockResolvedValue({ data: { data: [], pagination: {} } });
      await tasksApi.getByLead('l1', { page: 1, limit: 10 });
      expect(client.get).toHaveBeenCalledWith('/tasks/leads/l1/tasks', { params: { page: 1, limit: 10 } });
    });
  });
});

describe('tasksApi envelope normalisation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list returns a flat PaginatedResponse of camelCase tasks', async () => {
    vi.mocked(client.get).mockResolvedValue({
      success: true,
      data: [{ id: 't1', title: 'A', due_date: '2026-04-01', assignee_name: 'Asha', created_at: '2026-01-01T00:00:00Z', subtask_count: 3, completed_subtask_count: 1 }],
      pagination: { page: 1, limit: 20, total: 41, totalPages: 3 },
    });
    const result = await tasksApi.list({ page: 1, limit: 20 });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 41, totalPages: 3 });
    expect(result.data[0]).toMatchObject({
      id: 't1', dueDate: '2026-04-01', assigneeName: 'Asha', createdAt: '2026-01-01T00:00:00Z', subtaskCount: 3, completedSubtaskCount: 1,
    });
    expect(result.data[0]).not.toHaveProperty('due_date');
  });

  it('list also copes with the { data: { data, pagination } } envelope', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 't1', related_lead_id: 'l9' }], pagination: { page: 1, limit: 5, total: 1, totalPages: 1 } } });
    const result = await tasksApi.list({ page: 1, limit: 5 });
    expect(result.data[0]?.relatedLeadId).toBe('l9');
    expect(result.data[0]?.leadId).toBe('l9');
    expect(result.pagination.total).toBe(1);
  });

  it('getById unwraps and camelizes the task', async () => {
    vi.mocked(client.get).mockResolvedValue({ success: true, data: { id: 't1', completed_at: '2026-02-02T00:00:00Z', lead_title: 'Bali' } });
    const result = await tasksApi.getById('t1');
    expect(result.data).toMatchObject({ id: 't1', completedAt: '2026-02-02T00:00:00Z', leadTitle: 'Bali' });
  });

  it('getSubtasks and getComments camelize their rows', async () => {
    vi.mocked(client.get).mockResolvedValueOnce({ data: [{ id: 's1', assignee_name: 'Ravi', due_date: '2026-01-01' }] });
    const subs = await tasksApi.getSubtasks('t1');
    expect(subs.data[0]).toMatchObject({ assigneeName: 'Ravi', dueDate: '2026-01-01' });

    vi.mocked(client.get).mockResolvedValueOnce({ data: [{ id: 'c1', user_name: 'Asha', created_at: '2026-01-01T00:00:00Z' }] });
    const comments = await tasksApi.getComments('t1');
    expect(comments.data[0]).toMatchObject({ userName: 'Asha', createdAt: '2026-01-01T00:00:00Z' });
  });

  it('update sends both key spellings for legacy callers', async () => {
    vi.mocked(client.put).mockResolvedValue({ data: { id: 't1' } });
    await tasksApi.update('t1', { assigned_to: 'u2' });
    expect(client.put).toHaveBeenCalledWith('/tasks/t1', { assignedTo: 'u2', assigned_to: 'u2' });
  });
});
