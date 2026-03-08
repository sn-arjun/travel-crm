import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Task type not in shared package, define locally
export interface Task {
  id: string;
  title: string;
  description?: string;
  type?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'todo';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;
  dueDate?: string;
  relatedTo?: string;
  leadId?: string;
  progress?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'todo' | 'in_progress' | 'completed';
  dueDate?: string;
  assignedTo?: string;
  leadId?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  status?: 'todo' | 'in_progress' | 'completed';
  dueDate?: string;
  assignedTo?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateTaskStatusRequest {
  status: 'todo' | 'in_progress' | 'completed' | 'done';
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  order: number;
}

export interface TaskComment {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface TaskDashboardSummary {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  tasksByStatus: Record<string, number>;
  tasksByPriority: Record<string, number>;
}

export const tasksApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    leadId?: string;
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

  getDashboardSummary: () =>
    client.get<ApiResponse<TaskDashboardSummary>>(API_ENDPOINTS.tasks.dashboardSummary),

  getByLead: (leadId: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<Task>>>(API_ENDPOINTS.tasks.byLead(leadId), { params }),
};
