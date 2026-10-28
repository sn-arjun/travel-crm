import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { templatesApi, type MessageTemplate } from './templates';
import { marketingApi } from './marketing';

export type WhatsappCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed';

export interface WhatsappCampaign {
  id: string;
  name: string;
  templateId: string;
  templateName?: string;
  segmentId?: string | null;
  segmentName?: string | null;
  status: WhatsappCampaignStatus;
  scheduledFor?: string | null;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  failedCount?: number;
  recipientCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Shape the backend returns: no template/segment foreign keys, `scheduledAt`, `totalRecipients`. */
interface RawWhatsappCampaign {
  id: string;
  name: string;
  status: WhatsappCampaignStatus;
  templateName?: string | null;
  templateContent?: string | null;
  templateVariables?: Record<string, string> | null;
  audienceFilter?: Record<string, unknown> | null;
  totalRecipients?: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  scheduledAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsappCampaignAnalytics {
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
}

export interface WhatsappCampaignRecipient {
  id: string;
  contactId?: string;
  name: string;
  phone: string;
  status: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
}

export interface CreateWhatsappCampaignRequest {
  name: string;
  templateId: string;
  segmentId?: string;
  scheduledFor?: string;
}

export type UpdateWhatsappCampaignRequest = Partial<CreateWhatsappCampaignRequest>;

export interface SendWhatsappCampaignRequest {
  sendImmediately?: boolean;
}

// The backend stores no template/segment foreign keys, so the picked ids and the
// segment name ride along in templateVariables (a string map) to round-trip into detail/edit.
const META_TEMPLATE_ID = '__templateId';
const META_SEGMENT_ID = '__segmentId';
const META_SEGMENT_NAME = '__segmentName';
const AUDIENCE_KEYS = ['source', 'leadStatus', 'country'] as const;

function fromRaw(r: RawWhatsappCampaign): WhatsappCampaign {
  const meta = r.templateVariables ?? {};
  return {
    id: r.id,
    name: r.name,
    templateId: meta[META_TEMPLATE_ID] ?? '',
    templateName: r.templateName ?? undefined,
    segmentId: meta[META_SEGMENT_ID] || null,
    segmentName: meta[META_SEGMENT_NAME] || null,
    status: r.status,
    scheduledFor: r.scheduledAt ?? null,
    sentCount: r.sentCount ?? 0,
    deliveredCount: r.deliveredCount ?? 0,
    readCount: r.readCount ?? 0,
    repliedCount: 0,
    failedCount: r.failedCount ?? 0,
    recipientCount: r.totalRecipients ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

async function toRawBody(data: UpdateWhatsappCampaignRequest) {
  const body: Record<string, unknown> = {};
  if (data.name !== undefined) body.name = data.name;
  if (data.scheduledFor) body.scheduledAt = data.scheduledFor;

  const meta: Record<string, string> = {};
  if (data.templateId) {
    const tpl = (await templatesApi.getById(data.templateId)).data;
    body.templateContent = tpl.content;
    body.templateName = tpl.name;
    meta[META_TEMPLATE_ID] = tpl.id;
  }
  if (data.segmentId !== undefined) {
    const audience: Record<string, string> = {};
    if (data.segmentId) {
      const seg = (await marketingApi.segments.get(data.segmentId)).data;
      meta[META_SEGMENT_ID] = seg.id;
      meta[META_SEGMENT_NAME] = seg.name;
      for (const k of AUDIENCE_KEYS) {
        const v = seg.criteria?.[k];
        if (typeof v === 'string' && v) audience[k] = v;
      }
    }
    body.audienceFilter = audience;
  }
  if (data.templateId || data.segmentId !== undefined) body.templateVariables = meta;
  return body;
}

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

type RawList = { data: RawWhatsappCampaign[]; pagination: { total: number; hasMore: boolean } };

export const whatsappCampaignsApi = {
  list: async (params?: ListParams) => {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 20;
    const search = params?.search?.trim().toLowerCase();
    const status = params?.status || undefined;

    // The backend has no text search; when searching, pull every page and filter here.
    if (search) {
      const all: WhatsappCampaign[] = [];
      for (let p = 1; ; p += 1) {
        const res = await client.get<RawList>(API_ENDPOINTS.whatsappCampaigns.list, {
          params: { status, page: p, limit: 50 },
        });
        all.push(...res.data.map(fromRaw));
        if (!res.pagination?.hasMore) break;
      }
      const matched = all.filter(
        (c) => c.name.toLowerCase().includes(search) || (c.templateName ?? '').toLowerCase().includes(search),
      );
      return {
        data: {
          data: matched.slice((page - 1) * limit, page * limit),
          pagination: { page, limit, total: matched.length, totalPages: Math.ceil(matched.length / limit) },
        },
      } as ApiResponse<PaginatedResponse<WhatsappCampaign>>;
    }

    const res = await client.get<RawList>(API_ENDPOINTS.whatsappCampaigns.list, {
      params: { status, page, limit },
    });
    return {
      data: {
        data: res.data.map(fromRaw),
        pagination: {
          page,
          limit,
          total: res.pagination.total,
          totalPages: Math.ceil(res.pagination.total / limit),
        },
      },
    } as ApiResponse<PaginatedResponse<WhatsappCampaign>>;
  },

  getById: async (id: string) => {
    const res = await client.get<ApiResponse<RawWhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.byId(id));
    return { data: fromRaw(res.data) } as ApiResponse<WhatsappCampaign>;
  },

  create: async (data: CreateWhatsappCampaignRequest) =>
    client.post<ApiResponse<{ id: string; status: WhatsappCampaignStatus }>>(
      API_ENDPOINTS.whatsappCampaigns.create,
      await toRawBody(data),
    ),

  update: async (id: string, data: UpdateWhatsappCampaignRequest) =>
    client.put<ApiResponse<unknown>>(API_ENDPOINTS.whatsappCampaigns.byId(id), await toRawBody(data)),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.whatsappCampaigns.byId(id)),

  send: (id: string, data?: SendWhatsappCampaignRequest) =>
    client.post<ApiResponse<unknown>>(API_ENDPOINTS.whatsappCampaigns.send(id), data),

  pause: (id: string) =>
    client.post<ApiResponse<unknown>>(API_ENDPOINTS.whatsappCampaigns.pause(id)),

  cancel: (id: string) =>
    client.post<ApiResponse<unknown>>(API_ENDPOINTS.whatsappCampaigns.cancel(id)),

  getAnalytics: async (id: string) => {
    const res = await client.get<
      ApiResponse<{
        statusBreakdown?: Record<string, number>;
        rates?: { deliveryRate: number; readRate: number };
      }>
    >(API_ENDPOINTS.whatsappCampaigns.analytics(id));
    const b = res.data.statusBreakdown ?? {};
    const replied = b.replied ?? 0;
    const read = (b.read ?? 0) + replied;
    const delivered = (b.delivered ?? 0) + read;
    const sent = (b.sent ?? 0) + delivered;
    return {
      data: {
        sentCount: sent,
        deliveredCount: delivered,
        readCount: read,
        repliedCount: replied,
        failedCount: b.failed ?? 0,
        deliveryRate: res.data.rates?.deliveryRate ?? 0,
        readRate: res.data.rates?.readRate ?? 0,
        replyRate: delivered > 0 ? Math.round((replied / delivered) * 100) : 0,
      },
    } as ApiResponse<WhatsappCampaignAnalytics>;
  },

  getRecipients: async (id: string, params?: { page?: number; limit?: number }) => {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const res = await client.get<{ data: WhatsappCampaignRecipient[]; pagination: { total: number } }>(
      API_ENDPOINTS.whatsappCampaigns.recipients(id),
      { params: { page, limit } },
    );
    return {
      data: {
        data: res.data,
        pagination: { page, limit, total: res.pagination.total, totalPages: Math.ceil(res.pagination.total / limit) },
      },
    } as ApiResponse<PaginatedResponse<WhatsappCampaignRecipient>>;
  },
};

/** Active WhatsApp templates for the campaign template picker (backend returns a top-level array). */
export async function listWhatsappTemplates(search: string, page: number) {
  const res = await client.get<{ data: MessageTemplate[]; pagination: { total: number } }>(
    API_ENDPOINTS.templates.list,
    { params: { channel: 'whatsapp', is_active: 1, search: search || undefined, page, limit: 20 } },
  );
  return { items: res.data, total: res.pagination.total };
}
