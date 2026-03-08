import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Task type not in shared package, define locally
export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  category?: 'general' | 'follow_up' | 'documentation' | 'meeting' | 'payment' | 'visa';
  assignedTo?: string;
  assignee_name?: string;
  dueDate?: string;
  due_date?: string;
  relatedLeadId?: string;
  leadId?: string;
  lead_title?: string;
  related_lead_id?: string;
  parentTaskId?: string;
  parent_task_id?: string;
  completedAt?: string;
  completed_at?: string;
  overdueNotifiedDate?: string;
  overdue_notified_date?: string;
  subtaskCount?: number;
  subtask_count?: number;
  completedSubtaskCount?: number;
  completed_subtask_count?: number;
  createdBy: string;
  created_by?: string;
  createdAt: string;
  created_at?: string;
  updatedAt: string;
  updated_at?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  status?: 'todo' | 'in_progress' | 'done';
  due_date?: string;
  assignedTo?: string;
  assigned_to?: string;
  related_lead_id?: string;
  parent_task_id?: string;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  category?: string;
  status?: 'todo' | 'in_progress' | 'done';
  due_date?: string;
  assigned_to?: string;
  related_lead_id?: string;
}

export interface UpdateTaskStatusRequest {
  status: 'todo' | 'in_progress' | 'done';
}

export interface Subtask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee_name?: string;
  due_date?: string;
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  created_at?: string;
  createdBy: string;
  created_by?: string;
  user_name?: string;
  updatedAt: string;
  updated_at?: string;
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

export const tasksApi = {
  list: (params?: {
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
  }) =>
    client.get<ApiResponse<PaginatedResponse<Task>>>(API_ENDPOINTS.tasks.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Task>>(API_ENDPOINTS.tasks.byId(id)),

  create: (data: CreateTaskRequest) =>
    client.post<ApiResponse<Task>>(API_ENDPOINTS.tasks.create, data),

  update: (id: string, data: UpdateTaskRequest) =>
    client.put<ApiResponse<Task>>(API_ENDPOINTS.tasks.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.tasks.byId(id)),

  updateStatus: (id: string, data: UpdateTaskStatusRequest) =>
    client.patch<ApiResponse<Task>>(API_ENDPOINTS.tasks.status(id), data),

  getSubtasks: (id: string) =>
    client.get<ApiResponse<Subtask[]>>(API_ENDPOINTS.tasks.subtasks(id)),

  getComments: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<TaskComment>>>(API_ENDPOINTS.tasks.comments(id), { params }),

  createComment: (taskId: string, content: string) =>
    client.post<ApiResponse<TaskComment>>(API_ENDPOINTS.tasks.comments(taskId), { content }),

  updateComment: (taskId: string, commentId: string, content: string) =>
    client.put<ApiResponse<TaskComment>>(`${API_ENDPOINTS.tasks.comments(taskId)}/${commentId}`, { content }),

  deleteComment: (taskId: string, commentId: string) =>
    client.delete<ApiResponse<void>>(`${API_ENDPOINTS.tasks.comments(taskId)}/${commentId}`),

  getDashboardSummary: () =>
    client.get<ApiResponse<TaskDashboardSummary>>(API_ENDPOINTS.tasks.dashboardSummary),

  getByLead: (leadId: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<Task>>>(API_ENDPOINTS.tasks.byLead(leadId), { params }),
};
