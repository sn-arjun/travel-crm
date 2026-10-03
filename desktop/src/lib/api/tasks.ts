import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { camelizeKeys, toApiResponse, unwrapEntity, unwrapList } from './envelope';

// Task type not in shared package, define locally.
// The tasks endpoints answer in snake_case; this client camelizes every row, so the
// UI only ever sees the camelCase names below.
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  category?: 'general' | 'follow_up' | 'documentation' | 'meeting' | 'payment' | 'visa';
  assignedTo?: string;
  assigneeName?: string;
  dueDate?: string;
  relatedLeadId?: string;
  leadId?: string;
  leadTitle?: string;
  parentTaskId?: string;
  completedAt?: string;
  overdueNotifiedDate?: string;
  subtaskCount?: number;
  completedSubtaskCount?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request bodies accept camelCase. The current backend only reads the snake_case
 * keys on create/update (it picks up camelCase after B12), so both spellings are
 * sent; the legacy snake_case names are still accepted from callers.
 */
export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  status?: 'todo' | 'in_progress' | 'done';
  dueDate?: string;
  assignedTo?: string;
  relatedLeadId?: string;
  parentTaskId?: string;
  /** @deprecated use dueDate */
  due_date?: string;
  /** @deprecated use assignedTo */
  assigned_to?: string;
  /** @deprecated use relatedLeadId */
  related_lead_id?: string;
  /** @deprecated use parentTaskId */
  parent_task_id?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  status?: 'todo' | 'in_progress' | 'done';
  dueDate?: string;
  assignedTo?: string;
  relatedLeadId?: string;
  /** @deprecated use dueDate */
  due_date?: string;
  /** @deprecated use assignedTo */
  assigned_to?: string;
  /** @deprecated use relatedLeadId */
  related_lead_id?: string;
}

export interface UpdateTaskStatusRequest {
  status: 'todo' | 'in_progress' | 'done';
}

export interface Subtask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assigneeName?: string;
  dueDate?: string;
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: string;
  userId?: string;
  userName?: string;
  updatedAt?: string;
}

export interface TaskDashboardSummary {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  today_tasks?: number;
  overdue_count?: number;
  completed_today?: number;
  tasksByStatus: Record<string, number>;
  by_status?: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

type LegacyKeys = { due_date?: string; assigned_to?: string; related_lead_id?: string; parent_task_id?: string };
type TaskBodyInput = {
  dueDate?: string; assignedTo?: string; relatedLeadId?: string; parentTaskId?: string;
} & LegacyKeys;

/**
 * Builds a create/update body: camelCase plus the snake_case twins the current
 * backend reads. Undefined fields are omitted.
 */
function toTaskBody<B extends TaskBodyInput>(input: B): Record<string, unknown> {
  const { due_date, assigned_to, related_lead_id, parent_task_id, dueDate, assignedTo, relatedLeadId, parentTaskId, ...rest } = input;
  const body: Record<string, unknown> = { ...rest };
  const pairs: Array<[string, string, string | undefined]> = [
    ['dueDate', 'due_date', dueDate ?? due_date],
    ['assignedTo', 'assigned_to', assignedTo ?? assigned_to],
    ['relatedLeadId', 'related_lead_id', relatedLeadId ?? related_lead_id],
    ['parentTaskId', 'parent_task_id', parentTaskId ?? parent_task_id],
  ];
  for (const [camel, snake, value] of pairs) {
    if (value !== undefined) {
      body[camel] = value;
      body[snake] = value;
    }
  }
  return body;
}

export function normalizeTask(raw: unknown): Task {
  const t = camelizeKeys<Record<string, unknown>>(raw) ?? {};
  return {
    ...t,
    relatedLeadId: (t.relatedLeadId ?? t.leadId) as string | undefined,
    leadId: (t.leadId ?? t.relatedLeadId) as string | undefined,
    subtaskCount: Number(t.subtaskCount ?? 0),
    completedSubtaskCount: Number(t.completedSubtaskCount ?? 0),
  } as unknown as Task;
}

function taskEntity(res: unknown): ApiResponse<Task> {
  const entity = unwrapEntity<unknown>(res);
  return toApiResponse(entity && typeof entity === 'object' ? normalizeTask(entity) : (entity as Task));
}

function camelList<T>(res: unknown): ApiResponse<T[]> {
  return toApiResponse(camelizeKeys<T[]>(unwrapList<T>(res).data));
}

export const tasksApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    category?: string;
    assigned_to?: string;
    assignedTo?: string;
    related_lead_id?: string;
    leadId?: string;
    view?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Task>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.tasks.list, { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map(normalizeTask) };
  },

  getById: async (id: string): Promise<ApiResponse<Task>> =>
    taskEntity(await client.get<unknown>(API_ENDPOINTS.tasks.byId(id))),

  create: async (data: CreateTaskRequest): Promise<ApiResponse<Task>> =>
    taskEntity(await client.post<unknown>(API_ENDPOINTS.tasks.create, toTaskBody(data))),

  update: async (id: string, data: UpdateTaskRequest): Promise<ApiResponse<Task>> =>
    taskEntity(await client.put<unknown>(API_ENDPOINTS.tasks.byId(id), toTaskBody(data))),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.tasks.byId(id)),

  updateStatus: async (id: string, data: UpdateTaskStatusRequest): Promise<ApiResponse<Task>> =>
    taskEntity(await client.patch<unknown>(API_ENDPOINTS.tasks.status(id), data)),

  getSubtasks: async (id: string): Promise<ApiResponse<Subtask[]>> =>
    camelList<Subtask>(await client.get<unknown>(API_ENDPOINTS.tasks.subtasks(id))),

  getComments: async (id: string, params?: { page?: number; limit?: number }): Promise<PaginatedResponse<TaskComment>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.tasks.comments(id), { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: camelizeKeys<TaskComment[]>(list.data) };
  },

  createComment: async (taskId: string, content: string): Promise<ApiResponse<TaskComment>> =>
    toApiResponse(camelizeKeys<TaskComment>(unwrapEntity(await client.post<unknown>(API_ENDPOINTS.tasks.comments(taskId), { content })))),

  updateComment: async (taskId: string, commentId: string, content: string): Promise<ApiResponse<TaskComment>> =>
    toApiResponse(camelizeKeys<TaskComment>(unwrapEntity(await client.put<unknown>(`${API_ENDPOINTS.tasks.comments(taskId)}/${commentId}`, { content })))),

  deleteComment: (taskId: string, commentId: string) =>
    client.delete<ApiResponse<void>>(`${API_ENDPOINTS.tasks.comments(taskId)}/${commentId}`),

  getDashboardSummary: () =>
    client.get<ApiResponse<TaskDashboardSummary>>(API_ENDPOINTS.tasks.dashboardSummary),

  getByLead: async (leadId: string, params?: { page?: number; limit?: number }): Promise<PaginatedResponse<Task>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.tasks.byLead(leadId), { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map(normalizeTask) };
  },
};
