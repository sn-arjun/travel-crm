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
  /** CRM contact this visitor is linked to; messaging needs it. */
  contactId?: string;
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

export interface CreateLeadFromConversationRequest {
  title?: string;
  priority?: 'hot' | 'warm' | 'cold';
}

/**
 * The backend (backend/src/routes/chatbot.ts) returns raw D1 rows: snake_case
 * columns, `messages` as a JSON string with roles assistant/user/agent, and
 * started/ended timestamps named created_at/closed_at rather than the
 * camelCase contract this module's types declare. Normalize at the boundary
 * so the rest of the app can rely on the typed shape.
 */
interface RawMessage {
  id?: string;
  role?: string;
  sender?: string;
  conversationId?: string;
  conversation_id?: string;
  text?: string;
  content?: string;
  attachments?: ChatbotMessage['attachments'];
  timestamp: string;
}

interface RawConversation {
  id: string;
  visitorId?: string;
  visitor_id?: string;
  visitorName?: string | null;
  visitor_name?: string | null;
  visitorEmail?: string | null;
  visitor_email?: string | null;
  contactId?: string | null;
  contact_id?: string | null;
  channel: ChatbotConversation['channel'];
  status: ChatbotConversation['status'];
  messages?: RawMessage[] | string | null;
  startedAt?: string;
  created_at?: string;
  endedAt?: string | null;
  closed_at?: string | null;
  handedOffTo?: string | null;
  assigned_user_id?: string | null;
  notes?: string;
}

interface RawChannelConfig {
  id?: string;
  channel: string;
  enabled?: number | boolean;
  name?: string;
  description?: string;
  branding_logo?: string | null;
  greeting?: string;
  welcomeMessage?: string;
  widget_position?: string;
  branding_color?: string;
  auto_reply?: string;
}

interface RawPagination {
  page?: number;
  limit?: number;
  offset?: number;
  total?: number;
  totalPages?: number;
}

interface RawConversationList {
  data?: RawConversation[];
  pagination?: RawPagination;
}

function normalizeMessage(raw: RawMessage): ChatbotMessage {
  const role = raw.role ?? raw.sender;
  return {
    id: raw.id ?? `${raw.timestamp}-${Math.random().toString(36).slice(2)}`,
    conversationId: raw.conversationId ?? raw.conversation_id ?? '',
    sender: role === 'assistant' ? 'bot' : role === 'agent' ? 'bot' : 'user',
    text: raw.text ?? raw.content ?? '',
    attachments: raw.attachments,
    timestamp: raw.timestamp,
  };
}

function normalizeConversation(raw: RawConversation): ChatbotConversation {
  let messages: ChatbotMessage[] = [];
  if (Array.isArray(raw.messages)) {
    messages = raw.messages.map(normalizeMessage);
  } else if (typeof raw.messages === 'string' && raw.messages) {
    try {
      messages = (JSON.parse(raw.messages) as RawMessage[]).map(normalizeMessage);
    } catch {
      messages = [];
    }
  }

  return {
    id: raw.id,
    visitorId: raw.visitorId ?? raw.visitor_id,
    visitorName: raw.visitorName ?? raw.visitor_name ?? undefined,
    visitorEmail: raw.visitorEmail ?? raw.visitor_email ?? undefined,
    contactId: raw.contactId ?? raw.contact_id ?? undefined,
    channel: raw.channel,
    status: raw.status,
    messages,
    startedAt: raw.startedAt ?? raw.created_at ?? '',
    endedAt: raw.endedAt ?? raw.closed_at ?? undefined,
    handedOffTo: raw.handedOffTo ?? raw.assigned_user_id ?? undefined,
    notes: raw.notes,
  };
}

function normalizeConfig(rows: RawChannelConfig[]): ChatbotConfig {
  const web = rows.find((r) => r.channel === 'web');
  const source = web ?? rows[0];
  return {
    id: source?.id ?? '',
    enabled: !!(source?.enabled ?? 0),
    name: source?.name ?? 'Chatbot',
    description: source?.description,
    avatar: source?.branding_logo ?? undefined,
    welcomeMessage: source?.greeting ?? source?.welcomeMessage ?? '',
    channels: rows.map((r) => ({
      platform: r.channel as ChatbotConfig['channels'][number]['platform'],
      enabled: !!r.enabled,
      config: {
        position: r.widget_position,
        primaryColor: r.branding_color,
        autoReply: r.auto_reply,
        greetingMessage: r.greeting,
      },
    })),
  };
}

/** GET /chatbot/widget */
export interface ChatbotWidgetInfo {
  widgetKey: string;
  scriptUrl: string;
  snippet: string;
  allowedOrigins: string[];
}

/**
 * Turn what an agent typed (one website per line, or comma separated) into origins the widget
 * check compares against: scheme + host + port, no path, no trailing slash. Entries that are not
 * a website address are returned in `invalid`.
 */
export function parseAllowedOrigins(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\n,]+/)) {
    const entry = part.trim();
    if (!entry) continue;
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(entry) ? entry : `https://${entry}`);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) throw new Error('not a website');
      const origin = url.origin.toLowerCase();
      if (!origins.includes(origin)) origins.push(origin);
    } catch {
      invalid.push(entry);
    }
  }
  return { origins, invalid };
}

export const chatbotApi = {
  config: {
    get: async (): Promise<ApiResponse<ChatbotConfig>> => {
      const res = await client.get<ApiResponse<RawChannelConfig[]>>(API_ENDPOINTS.chatbot.config);
      return { ...res, data: normalizeConfig(Array.isArray(res.data) ? res.data : []) };
    },

    update: (data: UpdateChatbotConfigRequest) => {
      const channels = data.channels ?? [];
      const web = channels.find((ch) => ch.platform === 'web');
      const whatsapp = channels.find((ch) => ch.platform === 'whatsapp');
      const requests: Promise<unknown>[] = [];
      if (web) {
        requests.push(client.put(API_ENDPOINTS.chatbot.configChannel('web'), {
          enabled: data.enabled ?? web.enabled,
          greeting: data.welcomeMessage,
          brandingColor: web.config?.primaryColor,
        }));
      }
      if (whatsapp) {
        requests.push(client.put(API_ENDPOINTS.chatbot.configChannel('whatsapp'), {
          enabled: whatsapp.enabled,
          greeting: whatsapp.config?.greetingMessage,
        }));
      }
      return Promise.all(requests).then(() => chatbotApi.config.get());
    },
  },

  configChannel: {
    get: (channel: string) =>
      client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.chatbot.configChannel(channel)),

    update: (channel: string, data: UpdateChannelConfigRequest) =>
      client.put<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.chatbot.configChannel(channel), data),
  },

  conversations: {
    list: async (params?: {
      page?: number;
      limit?: number;
      channel?: string;
      status?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }): Promise<ApiResponse<PaginatedResponse<ChatbotConversation>>> => {
      const res = await client.get<RawConversationList>(API_ENDPOINTS.chatbot.conversations, { params });
      const raw = res.data as unknown as RawConversationList | RawConversation[];
      const items: RawConversation[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const pagination: RawPagination = (Array.isArray(raw) ? undefined : raw?.pagination) ?? (res as { pagination?: RawPagination }).pagination ?? { page: 1, limit: params?.limit ?? 20, total: items.length, totalPages: 1 };
      return {
        ...res,
        data: {
          data: items.map(normalizeConversation),
          pagination: {
            page: pagination.page ?? Math.floor((pagination.offset ?? 0) / (pagination.limit || 1)) + 1,
            limit: pagination.limit ?? params?.limit ?? 20,
            total: pagination.total ?? items.length,
            totalPages: pagination.totalPages ?? Math.ceil((pagination.total ?? 0) / (pagination.limit || 1)),
          },
        },
      };
    },

    getById: async (id: string): Promise<ApiResponse<ChatbotConversation>> => {
      const res = await client.get<ApiResponse<RawConversation>>(API_ENDPOINTS.chatbot.conversationById(id));
      return { ...res, data: normalizeConversation(res.data) };
    },

    close: async (id: string, data?: { notes?: string }): Promise<ApiResponse<ChatbotConversation>> => {
      await client.post(`${API_ENDPOINTS.chatbot.conversationById(id)}/close`, data);
      return chatbotApi.conversations.getById(id);
    },

    createLead: async (id: string, data?: CreateLeadFromConversationRequest): Promise<ApiResponse<{ id: string }>> => {
      const res = await client.post<ApiResponse<{ leadId: string }>>(`${API_ENDPOINTS.chatbot.conversationById(id)}/create-lead`, data);
      return { ...res, data: { id: res.data.leadId } };
    },
  },

  reply: {
    send: (conversationId: string, data: SendReplyRequest) =>
      client.post<ApiResponse<{ replied: boolean }>>(API_ENDPOINTS.chatbot.reply(conversationId), data),
  },

  handoff: {
    send: (conversationId: string, data: HandoffRequest) =>
      client.post<ApiResponse<{ handedOff: boolean; assignedTo: string }>>(API_ENDPOINTS.chatbot.handoff(conversationId), data),
  },

  analytics: {
    get: async (params?: { fromDate?: string; toDate?: string; channel?: string }): Promise<ApiResponse<ChatbotAnalytics>> => {
      const res = await client.get<ApiResponse<{
        totalConversations: number;
        byChannel: Array<{ channel: string; count: number }>;
        byStatus: Array<{ status: string; count: number }>;
        handoffCount: number;
        qualifiedCount: number;
        avgMessagesPerConversation: number;
        totalAiCost: number;
        handoffRate: string;
      }>>(API_ENDPOINTS.chatbot.analytics, { params });
      const raw = res.data;
      const resolvedConversations = raw.byStatus?.find((s) => s.status === 'closed' || s.status === 'qualified')?.count ?? raw.qualifiedCount ?? 0;
      const activeConversations = raw.byStatus?.find((s) => s.status === 'active')?.count ?? 0;
      return {
        ...res,
        data: {
          totalConversations: raw.totalConversations ?? 0,
          activeConversations,
          resolvedConversations,
          avgResolutionTime: 0,
          customerSatisfaction: 0,
          handoffRate: parseFloat(raw.handoffRate ?? '0') || 0,
        },
      };
    },
  },

  /**
   * The website widget. The public script lives at /api/v1/public/chatbot/:widgetKey/widget.js; the
   * backend tells us the key, the ready-made snippet and which websites may use it.
   */
  widget: {
    get: async (): Promise<ApiResponse<ChatbotWidgetInfo>> => {
      const res = await client.get<ApiResponse<Partial<ChatbotWidgetInfo>>>('/chatbot/widget');
      const raw = (res.data ?? {}) as Partial<ChatbotWidgetInfo>;
      return {
        ...res,
        data: {
          widgetKey: raw.widgetKey ?? '',
          scriptUrl: raw.scriptUrl ?? '',
          snippet: raw.snippet ?? '',
          allowedOrigins: Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : [],
        },
      };
    },

    /** Replace the list of websites allowed to load the widget. An empty list blocks every website. */
    saveAllowedOrigins: (allowedOrigins: string[]) =>
      client.put<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.chatbot.configChannel('website'), { allowedOrigins }),
  },
};
