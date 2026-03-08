import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface ChatbotConfig {
  id: string;
  enabled: boolean;
  name: string;
  description?: string;
  avatar?: string;
  welcomeMessage?: string;
  channels: Array<{
    platform: 'web' | 'facebook' | 'whatsapp' | 'telegram';
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
}

export interface ChatbotMessage {
  id: string;
  conversationId: string;
  sender: 'user' | 'bot';
  text: string;
  attachments?: Array<{
    type: 'image' | 'file' | 'link';
    url: string;
    name?: string;
  }>;
  timestamp: string;
}

export interface ChatbotConversation {
  id: string;
  visitorId?: string;
  visitorName?: string;
  visitorEmail?: string;
  channel: 'web' | 'facebook' | 'whatsapp' | 'telegram';
  status: 'active' | 'closed' | 'handed_off';
  messages: ChatbotMessage[];
  startedAt: string;
  endedAt?: string;
  handedOffTo?: string;
  notes?: string;
}

export interface ChatbotAnalytics {
  totalConversations: number;
  activeConversations: number;
  resolvedConversations: number;
  avgResolutionTime: number;
  customerSatisfaction: number;
  handoffRate: number;
}

export interface UpdateChatbotConfigRequest {
  enabled?: boolean;
  name?: string;
  description?: string;
  avatar?: string;
  welcomeMessage?: string;
  channels?: Array<{
    platform: 'web' | 'facebook' | 'whatsapp' | 'telegram';
    enabled: boolean;
    config: Record<string, unknown>;
  }>;
}

export interface UpdateChannelConfigRequest {
  enabled?: boolean;
  config?: Record<string, unknown>;
}

export interface SendReplyRequest {
  message: string;
  attachments?: Array<{
    type: 'image' | 'file' | 'link';
    url: string;
    name?: string;
  }>;
}

export interface HandoffRequest {
  assignTo: string;
  reason?: string;
  note?: string;
}

export const chatbotApi = {
  config: {
    get: () =>
      client.get<ApiResponse<ChatbotConfig>>(API_ENDPOINTS.chatbot.config),

    update: (data: UpdateChatbotConfigRequest) =>
      client.put<ApiResponse<ChatbotConfig>>(API_ENDPOINTS.chatbot.config, data),
  },

  configChannel: {
    get: (channel: string) =>
      client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.chatbot.configChannel(channel)),

    update: (channel: string, data: UpdateChannelConfigRequest) =>
      client.put<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.chatbot.configChannel(channel), data),
  },

  conversations: {
    list: (params?: {
      page?: number;
      limit?: number;
      channel?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<ChatbotConversation>>>(API_ENDPOINTS.chatbot.conversations, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<ChatbotConversation>>(API_ENDPOINTS.chatbot.conversationById(id)),

    close: (id: string, data?: { notes?: string }) =>
      client.post<ApiResponse<ChatbotConversation>>(`${API_ENDPOINTS.chatbot.conversationById(id)}/close`, data),
  },

  reply: {
    send: (conversationId: string, data: SendReplyRequest) =>
      client.post<ApiResponse<ChatbotMessage>>(API_ENDPOINTS.chatbot.reply(conversationId), data),
  },

  handoff: {
    send: (conversationId: string, data: HandoffRequest) =>
      client.post<ApiResponse<ChatbotConversation>>(API_ENDPOINTS.chatbot.handoff(conversationId), data),
  },

  analytics: {
    get: (params?: { fromDate?: string; toDate?: string; channel?: string }) =>
      client.get<ApiResponse<ChatbotAnalytics>>(API_ENDPOINTS.chatbot.analytics, { params }),
  },
};
