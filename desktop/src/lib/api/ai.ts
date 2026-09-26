import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface AiConversation {
  id: string;
  title: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedLead {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  notes?: string;
  confidence: number;
}

export interface GeneratedItinerary {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  destination: string;
  items: Array<{
    day: number;
    title: string;
    description: string;
    location?: string;
    time?: string;
  }>;
}

export interface ComposedMessage {
  subject?: string;
  body: string;
  tone?: string;
  language?: string;
}

export interface ComposeMessageResult {
  contentId: string;
  message: ComposedMessage;
  channel: 'whatsapp' | 'email' | 'sms';
  model: string;
  provider: string;
  cost: number;
}

export interface SuggestedReply {
  text: string;
  tone?: string;
  confidence: number;
}

export interface LeadScore {
  id?: string;
  leadId?: string;
  score: number;
  category?: string;
  factors: Array<{
    name: string;
    weight: number;
    contribution: number;
  }>;
  recommendation?: string;
  createdAt?: string;
}

/**
 * Raw shape persisted by POST /lead-score/:leadId and returned as-is by
 * GET /lead-score/:leadId (GET reads the DB row directly, so `signals` and
 * `breakdown` come back as JSON strings there but as parsed objects from the
 * POST response). `signals` is an AI-freeform array of scoring factors —
 * often empty — so `breakdown` (a fixed five-category score) is the reliable
 * fallback to render as factors.
 */
interface RawLeadScoreRow {
  id?: string;
  lead_id?: string;
  leadId?: string;
  score: number;
  category?: string;
  signals?: string | Array<{ name: string; value?: number; weight?: number; contribution?: number }>;
  breakdown?: string | Record<string, number>;
  calculated_at?: string;
  createdAt?: string;
}

function parseMaybeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeLeadScore(row: RawLeadScoreRow): LeadScore {
  const signals = parseMaybeJson<Array<{ name: string; value?: number; weight?: number; contribution?: number }>>(
    row.signals,
    [],
  );
  const breakdown = parseMaybeJson<Record<string, number>>(row.breakdown, {});

  const factors = signals.length > 0
    ? signals.map((s) => ({ name: s.name, weight: s.weight ?? 0, contribution: s.contribution ?? s.value ?? 0 }))
    : Object.entries(breakdown).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        weight: 0.2,
        contribution: value,
      }));

  return {
    id: row.id,
    leadId: row.leadId ?? row.lead_id,
    score: row.score,
    category: row.category,
    factors,
    createdAt: row.createdAt ?? row.calculated_at,
  };
}

export interface LeadScoreHistoryEntry {
  id: string;
  leadId: string;
  score: number;
  category?: string;
  createdAt: string;
}

export interface BulkLeadScoreResult {
  leadId: string;
  leadName?: string;
  score: number;
  category?: string;
}

export interface OcrPassportResult {
  firstName?: string;
  lastName?: string;
  passportNumber?: string;
  nationality?: string;
  dateOfBirth?: string;
  expiryDate?: string;
  confidence: number;
}

export interface OcrVisaClassification {
  country?: string;
  visaType?: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
  confidence: number;
}

export interface OcrSupplierInvoiceResult {
  supplierName?: string;
  invoiceNumber?: string;
  issueDate?: string;
  totalAmount?: number;
  currency?: string;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  confidence: number;
}

export interface SmartFollowup {
  id?: string;
  leadId?: string;
  leadName?: string;
  suggestedChannel?: string;
  suggestedTiming?: string;
  timingReasoning?: string;
  channelReasoning?: string;
  messageContent?: string;
  confidence?: number;
  status?: 'pending' | 'sent' | 'dismissed';
  createdAt?: string;
}

/** Raw row shape: camelCase from the POST /smart-followup/:leadId response, snake_case from the GET /smart-followups list (a direct DB row read). */
interface RawSmartFollowupRow {
  id?: string;
  leadId?: string;
  lead_id?: string;
  leadName?: string;
  suggestedChannel?: string;
  suggested_channel?: string;
  suggestedTiming?: string;
  suggested_timing?: string;
  timingReasoning?: string;
  timing_reasoning?: string;
  channelReasoning?: string;
  channel_reasoning?: string;
  messageContent?: string;
  message_content?: string;
  confidence?: number;
  confidence_score?: number;
  status?: 'pending' | 'sent' | 'dismissed';
  createdAt?: string;
  created_at?: string;
}

function normalizeSmartFollowup(row: RawSmartFollowupRow): SmartFollowup {
  return {
    id: row.id,
    leadId: row.leadId ?? row.lead_id,
    leadName: row.leadName,
    suggestedChannel: row.suggestedChannel ?? row.suggested_channel,
    suggestedTiming: row.suggestedTiming ?? row.suggested_timing,
    timingReasoning: row.timingReasoning ?? row.timing_reasoning,
    channelReasoning: row.channelReasoning ?? row.channel_reasoning,
    messageContent: row.messageContent ?? row.message_content,
    confidence: row.confidence ?? row.confidence_score,
    status: row.status ?? 'pending',
    createdAt: row.createdAt ?? row.created_at,
  };
}

export interface NlQueryResult {
  query: string;
  sql?: string;
  result?: unknown;
  narrative?: string;
  response: string;
  data?: Record<string, unknown>;
  visualizations?: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
}

export interface NlQueryHistoryEntry {
  id: string;
  query: string;
  sql?: string;
  narrative?: string;
  createdAt: string;
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  metric: string;
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
  recommendation?: string;
  status?: 'active' | 'dismissed' | 'actioned';
  createdAt?: string;
}

export interface Recommendation {
  id: string;
  category: string;
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
  status?: 'active' | 'dismissed' | 'actioned';
  createdAt?: string;
}

export interface DocumentScan {
  id: string;
  documentType: 'passport' | 'visa' | 'invoice';
  status: 'pending' | 'applied' | 'rejected';
  fileName?: string;
  extractedFields: Array<{ key: string; label: string; value: string; confidence: number }>;
  overallConfidence: number;
  contactId?: string;
  contactName?: string;
  createdAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface BriefingData {
  date: string;
  summary: string;
  keyMetrics: Record<string, number | string>;
  insights: Insight[];
  recommendations: Recommendation[];
}

/** Raw shape persisted by POST /ai/bi/briefings/generate and returned by GET /ai/bi/briefings(/:id). */
export interface RawBriefingRow {
  id: string;
  briefing_type: string;
  title: string;
  content: string; // JSON: Array<{ heading: string; body: string }>
  metrics: string; // JSON: Record<string, number | string>
  highlights: string; // JSON: string[]
  period: string;
  created_at: string;
}

function normalizeBriefing(row: RawBriefingRow): BriefingData & { id: string } {
  let sections: Array<{ heading: string; body: string }> = [];
  try {
    sections = JSON.parse(row.content || '[]');
  } catch {
    sections = [];
  }
  let keyMetrics: Record<string, number | string> = {};
  try {
    keyMetrics = JSON.parse(row.metrics || '{}');
  } catch {
    keyMetrics = {};
  }
  const summary = sections.map((s) => s.body).join('\n\n') || row.title;
  return {
    id: row.id,
    date: row.created_at,
    summary,
    keyMetrics,
    insights: [],
    recommendations: [],
  };
}

export interface HealthScoreResult {
  overallScore: number;
  byCategory: Record<string, number>;
  trends: Record<string, number[]>;
  recommendations: string[];
}

/** Raw shape returned by GET /ai/bi/health-score, POST /calculate, and each row of /history. */
export interface RawHealthScoreRow {
  id?: string;
  overallScore: number;
  revenueScore?: number;
  pipelineScore?: number;
  customerScore?: number;
  teamScore?: number;
  operationsScore?: number;
  trends?: string | Record<string, number[]>;
  recommendations?: string | string[];
  calculatedAt?: string;
  status?: string;
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeHealthScore(row: RawHealthScoreRow): HealthScoreResult {
  const byCategory: Record<string, number> = {};
  if (typeof row.revenueScore === 'number') byCategory.revenue = row.revenueScore;
  if (typeof row.pipelineScore === 'number') byCategory.pipeline = row.pipelineScore;
  if (typeof row.customerScore === 'number') byCategory.customer = row.customerScore;
  if (typeof row.teamScore === 'number') byCategory.team = row.teamScore;
  if (typeof row.operationsScore === 'number') byCategory.operations = row.operationsScore;
  return {
    overallScore: row.overallScore ?? 0,
    byCategory,
    trends: parseJsonField(row.trends, {}),
    recommendations: parseJsonField(row.recommendations, []),
  };
}

export interface ProfitabilityAnalysis {
  destination: string;
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * The AI providing this feature is a Workers AI binding that isn't available
 * in every environment; when it can't run, the route falls back to raw SQL
 * aggregates instead of the LLM's structured analysis. The client always
 * normalizes off `rawData` (destination, lead_count, won_count, total_revenue,
 * avg_deal_size) since that's the one field guaranteed to be present.
 */
interface RawDestinationRow {
  destination: string;
  lead_count: number;
  won_count: number;
  total_revenue: number | null;
  avg_deal_size: number | null;
}

function normalizeDestinationProfitability(rawData: RawDestinationRow[]): ProfitabilityAnalysis[] {
  return rawData.map((r) => {
    let destination = r.destination;
    try {
      const parsed = JSON.parse(destination);
      if (Array.isArray(parsed)) destination = parsed.join(', ');
    } catch {
      // Plain string destination — use as-is.
    }
    const revenue = r.total_revenue ?? 0;
    return {
      destination,
      revenue,
      costs: 0,
      profit: revenue,
      margin: revenue > 0 ? 100 : 0,
      trend: 'stable' as const,
    };
  });
}

export interface SeasonalDemandData {
  month: string;
  demand: number;
  avgBooking: number;
  trending: boolean;
}

/** GET /ai/bi/seasonal-demand is AI-freeform; only `forecast` is a reliably-shaped array. */
interface RawSeasonalDemandResponse {
  forecast?: Array<{ month: string; predictedLeads: number }>;
  peakMonths?: string[];
}

function normalizeSeasonalDemand(raw: RawSeasonalDemandResponse): SeasonalDemandData[] {
  const peak = new Set(raw.peakMonths ?? []);
  return (raw.forecast ?? []).map((f) => ({
    month: f.month,
    demand: f.predictedLeads ?? 0,
    avgBooking: 0,
    trending: peak.has(f.month),
  }));
}

export interface CashFlowForecast {
  period: string;
  inflow: number;
  outflow: number;
  netCashFlow: number;
  balance: number;
}

/** GET /ai/bi/cash-flow-forecast is AI-freeform; `forecast` has no running balance, so accumulate one client-side. */
interface RawCashFlowResponse {
  forecast?: Array<{ month: string; predictedInflow: number; predictedOutflow: number; netCashFlow: number }>;
}

function normalizeCashFlowForecast(raw: RawCashFlowResponse): CashFlowForecast[] {
  let balance = 0;
  return (raw.forecast ?? []).map((f) => {
    balance += f.netCashFlow ?? (f.predictedInflow ?? 0) - (f.predictedOutflow ?? 0);
    return {
      period: f.month,
      inflow: f.predictedInflow ?? 0,
      outflow: f.predictedOutflow ?? 0,
      netCashFlow: f.netCashFlow ?? (f.predictedInflow ?? 0) - (f.predictedOutflow ?? 0),
      balance,
    };
  });
}

export interface TeamPerformanceMetrics {
  userId: string;
  userName: string;
  dealsClosedCount: number;
  revenue: number;
  conversionRate: number;
  avgDealValue: number;
}

/** GET /ai/bi/team-performance is AI-freeform; `rawData` is the reliable SQL aggregate. */
interface RawTeamPerformanceRow {
  id: string;
  name: string;
  total_leads: number;
  won_leads: number;
  revenue: number | null;
  avg_deal_size: number | null;
}

function normalizeTeamPerformance(rawData: RawTeamPerformanceRow[]): TeamPerformanceMetrics[] {
  return rawData.map((r) => ({
    userId: r.id,
    userName: r.name,
    dealsClosedCount: r.won_leads ?? 0,
    revenue: r.revenue ?? 0,
    conversionRate: r.total_leads > 0 ? ((r.won_leads ?? 0) / r.total_leads) * 100 : 0,
    avgDealValue: r.avg_deal_size ?? 0,
  }));
}

export interface TrendingDestination {
  name: string;
  bookings: number;
  revenue: number;
  avgDealValue: number;
  trend: 'up' | 'down';
}

/** GET /ai/bi/trending-destinations returns raw lead-count comparisons, not revenue. */
interface RawTrendingDestinationRow {
  destination: string;
  currentCount: number;
  previousCount: number;
  growth: string; // percentage string, or the literal 'new'
}

function normalizeTrendingDestinations(trending: RawTrendingDestinationRow[]): TrendingDestination[] {
  return trending.map((t) => {
    let name = t.destination;
    try {
      const parsed = JSON.parse(name);
      if (Array.isArray(parsed)) name = parsed.join(', ');
    } catch {
      // Plain string destination — use as-is.
    }
    const growthValue = t.growth === 'new' ? 100 : parseFloat(t.growth);
    return {
      name,
      bookings: t.currentCount,
      revenue: 0,
      avgDealValue: 0,
      trend: (Number.isFinite(growthValue) ? growthValue : 0) >= 0 ? ('up' as const) : ('down' as const),
    };
  });
}

export interface LostDealAnalysis {
  dealId: string;
  reason: string;
  estimatedLoss: number;
  preventionStrategy: string;
}

/** GET /ai/bi/lost-deal-analysis is AI-freeform; `rawByReason` is the reliable SQL aggregate fallback. */
interface RawLostDealReasonRow {
  lost_reason: string;
  count: number;
  lost_value: number;
}

function normalizeLostDealAnalysis(rawByReason: RawLostDealReasonRow[]): LostDealAnalysis[] {
  return rawByReason.map((r) => ({
    dealId: r.lost_reason,
    reason: `${r.lost_reason} (${r.count} deal${r.count === 1 ? '' : 's'})`,
    estimatedLoss: r.lost_value ?? 0,
    preventionStrategy: 'Review and address this loss reason with the sales team.',
  }));
}

export interface LeadSourceRoi {
  source: string;
  leadsGenerated: number;
  dealsClosedCount: number;
  revenue: number;
  costPerLead: number;
  roi: number;
}

/**
 * GET /ai/bi/lead-source-roi returns totalLeads/wonLeads/totalRevenue directly
 * (no AI step, no ad-spend tracking) — roi is approximated from conversion
 * rate since there's no cost data to compute a true return on spend.
 */
interface RawLeadSourceRoiRow {
  source: string;
  totalLeads: number;
  wonLeads: number;
  totalRevenue: number;
  conversionRate: string;
}

function normalizeLeadSourceRoi(rows: RawLeadSourceRoiRow[]): LeadSourceRoi[] {
  return rows.map((r) => ({
    source: r.source,
    leadsGenerated: r.totalLeads,
    dealsClosedCount: r.wonLeads,
    revenue: r.totalRevenue,
    costPerLead: 0,
    roi: parseFloat(r.conversionRate) || 0,
  }));
}

export interface RevenuePulseData {
  currentMonthRevenue: number;
  lastMonthRevenue: number;
  momChange: number;
  pipelineValue: number;
  avgDealSize: number;
}

export interface WorkloadAnalysis {
  userId: string;
  userName: string;
  openLeads: number;
  openTasks: number;
  overdueTasks: number;
  capacityScore: number;
  status: 'underloaded' | 'balanced' | 'overloaded';
}

export interface CustomerSegment {
  segment: string;
  customerCount: number;
  avgLtv: number;
  totalRevenue: number;
  characteristics: string[];
}

/**
 * GET /ai/bi/customer-segments returns one row per contact (ai_customer_segments
 * joined to contacts), not a segment-level rollup. The client aggregates by
 * `segment` for the summary table this page renders.
 */
interface RawCustomerSegmentRow {
  segment: string;
  lifetime_value: number | null;
  preferred_channel: string | null;
}

function normalizeCustomerSegments(rows: RawCustomerSegmentRow[]): CustomerSegment[] {
  const bySegment = new Map<string, { count: number; totalLtv: number; channels: Set<string> }>();
  for (const row of rows) {
    const entry = bySegment.get(row.segment) ?? { count: 0, totalLtv: 0, channels: new Set<string>() };
    entry.count += 1;
    entry.totalLtv += row.lifetime_value ?? 0;
    if (row.preferred_channel) entry.channels.add(row.preferred_channel);
    bySegment.set(row.segment, entry);
  }
  return Array.from(bySegment.entries()).map(([segment, entry]) => ({
    segment,
    customerCount: entry.count,
    avgLtv: entry.count > 0 ? entry.totalLtv / entry.count : 0,
    totalRevenue: entry.totalLtv,
    characteristics: Array.from(entry.channels),
  }));
}

export interface CustomerLtv {
  contactId: string;
  lifetimeValue: number;
  predictedValue: number;
  bookingCount: number;
  avgBookingValue: number;
  segment?: string;
}

/** POST /ai/bi/customer-ltv/:id is AI-freeform with no guaranteed fallback shape. */
interface RawCustomerLtvResponse {
  contactId: string;
  lifetimeValue?: number;
  predictedNextValue?: number;
  segment?: string;
  note?: string;
}

function normalizeCustomerLtv(raw: RawCustomerLtvResponse): CustomerLtv {
  return {
    contactId: raw.contactId,
    lifetimeValue: raw.lifetimeValue ?? 0,
    predictedValue: raw.predictedNextValue ?? 0,
    bookingCount: 0,
    avgBookingValue: 0,
    segment: raw.segment,
  };
}

export interface BiRecommendation {
  category: string;
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
  impact?: string;
}

export interface HealthScoreHistoryEntry {
  date: string;
  overallScore: number;
}

// AI Settings types
export interface AiFeatureFlag {
  key: string;
  enabled: boolean;
  tier: 'pro' | 'enterprise';
  overridden: boolean;
}

export interface UsageCap {
  key: string;
  limit: number;
  used: number;
  remaining: number;
  resetPeriod: 'daily' | 'monthly';
  lastResetAt: string;
  percentUsed: number;
  isExhausted: boolean;
}

export interface AiUsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  avgDurationMs: number;
}

export interface AiProviderStatus {
  anthropic: boolean;
  cloudflare: boolean;
  defaultProvider: 'cloudflare' | 'anthropic';
}

export interface AiSettingsData {
  plan: string;
  aiFeatures: AiFeatureFlag[];
  usageCaps: Record<string, Omit<UsageCap, 'key' | 'isExhausted'>>;
  usageSummary: AiUsageSummary;
  provider: AiProviderStatus;
}

export interface UsageBreakdown {
  taskType: string;
  modelName: string;
  requestCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
}

export interface UsageData {
  quotas: UsageCap[];
  breakdown: UsageBreakdown[];
  dailyTrend: Array<{ day: string; requests: number; cost: number }>;
}

/** GET /ai/bi/usage groups task type and model separately; the page wants one merged breakdown row per task type. */
interface RawUsageResponse {
  byTask?: Array<{ task_type: string; calls: number; tokens: number; cost: number }>;
  byModel?: Array<{ model_name: string; calls: number; cost: number }>;
  daily?: Array<{ day: string; calls: number; cost: number }>;
}

function normalizeUsage(raw: RawUsageResponse): UsageData {
  const primaryModel = (raw.byModel ?? []).slice().sort((a, b) => b.calls - a.calls)[0]?.model_name ?? 'unknown';
  return {
    quotas: [],
    breakdown: (raw.byTask ?? []).map((t) => ({
      taskType: t.task_type,
      modelName: primaryModel,
      requestCount: t.calls,
      totalInputTokens: t.tokens,
      totalOutputTokens: 0,
      totalCost: t.cost,
    })),
    dailyTrend: (raw.daily ?? []).map((d) => ({ day: d.day, requests: d.calls, cost: d.cost })),
  };
}

// ─── Generated content management (orphaned endpoints) ─────────────

export interface AiGeneratedContent {
  id: string;
  contentType: string;
  rawOutput?: string;
  structuredOutput?: Record<string, unknown>;
  model?: string;
  provider?: string;
  status?: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface AiGeneratedListParams {
  page?: number;
  limit?: number;
  contentType?: string;
}

export interface ParsedLeadCandidate {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  destination?: string;
  notes?: string;
  confidence: number;
}

export interface EnrichedItinerary {
  itinerary: Record<string, unknown>;
  provider: string;
}

export interface GeneratedInvoice {
  invoice: Record<string, unknown>;
  provider: string;
}

export interface ScannedBusinessCard {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  confidence: number;
}

export const aiApi = {
  conversations: {
    list: (params?: { page?: number; limit?: number }) =>
      client.get<ApiResponse<{ data: AiConversation[] }>>(API_ENDPOINTS.ai.conversations, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<AiConversation>>(`${API_ENDPOINTS.ai.conversations}/${id}`),

    create: (data: { title: string }) =>
      client.post<ApiResponse<AiConversation>>(API_ENDPOINTS.ai.conversations, data),

    remove: (id: string) =>
      client.delete<ApiResponse<{ id: string }>>(`${API_ENDPOINTS.ai.conversations}/${id}`),
  },

  // Content generated by the AI features above (extract-lead, compose-message,
  // generate-itinerary, ...) is persisted server-side for review/accept/reject.
  generated: {
    list: (params?: AiGeneratedListParams) =>
      client.get<ApiResponse<AiGeneratedContent[]>>('/ai/generated', {
        params: params as unknown as Record<string, string | number | boolean | undefined>,
      }),

    getById: (id: string) =>
      client.get<ApiResponse<AiGeneratedContent>>(`/ai/generated/${id}`),

    accept: (id: string) =>
      client.post<ApiResponse<{ id: string; status: string }>>(`/ai/generated/${id}/accept`),

    reject: (id: string) =>
      client.post<ApiResponse<{ id: string; status: string }>>(`/ai/generated/${id}/reject`),

    feedback: (id: string, data: { feedback: 'positive' | 'negative'; notes?: string }) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/generated/${id}/feedback`, data),
  },

  parseWhatsapp: (data: { message: string }) =>
    client.post<ApiResponse<{ extracted: ParsedLeadCandidate; contentId?: string; provider: string }>>(
      '/ai/parse-whatsapp',
      data,
    ),

  parseEmail: (data: { email: string; subject?: string }) =>
    client.post<ApiResponse<{ extracted: ParsedLeadCandidate; contentId?: string; provider: string }>>(
      '/ai/parse-email',
      data,
    ),

  parseBulkLeads: (data: { text: string }) =>
    client.post<ApiResponse<{ leads: ParsedLeadCandidate[]; count: number; provider: string }>>(
      '/ai/parse-bulk-leads',
      data,
    ),

  scanBusinessCard: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.post<ApiResponse<ScannedBusinessCard>>(
      '/ai/scan-business-card',
      formData as unknown as Record<string, unknown>,
    );
  },

  enrichItinerary: (data: { itinerary: Record<string, unknown>; enrichments: string[] }) =>
    client.post<ApiResponse<EnrichedItinerary>>('/ai/enrich-itinerary', data),

  generateInvoice: (data: { itinerary: Record<string, unknown>; currency?: string; markupPercent?: number }) =>
    client.post<ApiResponse<GeneratedInvoice>>('/ai/generate-invoice', data),

  extractLead: (data: { text: string; sourceUrl?: string }) =>
    client.post<ApiResponse<ExtractedLead>>(API_ENDPOINTS.ai.extractLead, data),

  generateItinerary: (data: { prompt: string; destination: string; duration: number; budget?: number; preferences?: string[] }) =>
    client.post<ApiResponse<GeneratedItinerary>>(API_ENDPOINTS.ai.generateItinerary, data),

  composeMessage: (data: {
    channel: 'whatsapp' | 'email' | 'sms';
    purpose: string;
    tone?: 'formal' | 'casual' | 'enthusiastic' | 'professional';
    language?: string;
    context?: {
      customerName?: string;
      destination?: string;
      leadStatus?: string;
      lastInteraction?: string;
      additionalContext?: string;
    };
  }) => client.post<ApiResponse<ComposeMessageResult>>(API_ENDPOINTS.ai.composeMessage, data),

  suggestReplies: (data: { message: string; context?: string }) =>
    client.post<ApiResponse<{ suggestions: SuggestedReply[] }>>(API_ENDPOINTS.ai.suggestReplies, data),

  intelligence: {
    nlQuery: (data: { query: string; context?: string }) =>
      client.post<ApiResponse<NlQueryResult>>(API_ENDPOINTS.ai.intelligence.nlQuery, data),

    getNlQueryHistory: () =>
      client.get<ApiResponse<NlQueryHistoryEntry[]>>('/ai/intelligence/nl-queries'),

    getInsights: (params?: { type?: string; limit?: number }) =>
      client.get<ApiResponse<Insight[]>>(API_ENDPOINTS.ai.intelligence.insights, { params }),

    getInsightById: (id: string) =>
      client.get<ApiResponse<Insight>>(`/ai/intelligence/insights/${id}`),

    dismissInsight: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/insights/${id}/dismiss`),

    actionInsight: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/insights/${id}/action`),

    getCustomerInsights: (contactId: string) =>
      client.post<ApiResponse<Insight[]>>(`/ai/intelligence/insights/customer/${contactId}`),

    generatePredictions: () =>
      client.post<ApiResponse<{ predictions: unknown }>>('/ai/intelligence/insights/predictions'),

    generateTrends: () =>
      client.post<ApiResponse<{ trends: unknown; anomalies: unknown; recommendations: unknown }>>(
        '/ai/intelligence/insights/trends',
      ),

    getRecommendations: (params?: { category?: string; priority?: string; limit?: number }) =>
      client.get<ApiResponse<Recommendation[]>>(API_ENDPOINTS.ai.intelligence.recommendations, { params }),

    actRecommendation: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/recommendations/${id}/act`),

    dismissRecommendation: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/recommendations/${id}/dismiss`),

    getLeadScore: async (id: string) => {
      const res = await client.get<ApiResponse<RawLeadScoreRow | null>>(API_ENDPOINTS.ai.intelligence.leadScore(id));
      return { ...res, data: res.data ? normalizeLeadScore(res.data) : null } as ApiResponse<LeadScore | null>;
    },

    calculateLeadScore: async (id: string) => {
      const res = await client.post<ApiResponse<RawLeadScoreRow>>(API_ENDPOINTS.ai.intelligence.leadScore(id));
      return { ...res, data: normalizeLeadScore(res.data) };
    },

    getLeadScoreHistory: async (id: string) => {
      const res = await client.get<ApiResponse<RawLeadScoreRow[]>>(`/ai/intelligence/lead-score/${id}/history`);
      const data = (res.data ?? []).map((row) => ({
        id: row.id ?? '',
        leadId: row.leadId ?? row.lead_id ?? id,
        score: row.score,
        category: row.category,
        createdAt: row.createdAt ?? row.calculated_at ?? '',
      }));
      return { ...res, data };
    },

    bulkLeadScore: (data: { leadIds: string[] }) =>
      client.post<ApiResponse<BulkLeadScoreResult[]>>('/ai/intelligence/lead-scores/bulk', data),

    ocrPassport: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<OcrPassportResult>>(API_ENDPOINTS.ai.intelligence.ocrPassport, formData as unknown as Record<string, unknown>);
    },

    ocrVisaClassify: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<OcrVisaClassification>>(API_ENDPOINTS.ai.intelligence.ocrVisaClassify, formData as unknown as Record<string, unknown>);
    },

    ocrSupplierInvoice: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<OcrSupplierInvoiceResult>>(API_ENDPOINTS.ai.intelligence.ocrSupplierInvoice, formData as unknown as Record<string, unknown>);
    },

    listDocumentScans: (params?: { page?: number; limit?: number; search?: string; status?: string; documentType?: string }) =>
      client.get<PaginatedResponse<DocumentScan>>('/ai/intelligence/document-scans', {
        params: params as unknown as Record<string, string | number | boolean | undefined>,
      }),

    getDocumentScanById: (id: string) =>
      client.get<ApiResponse<DocumentScan>>(`/ai/intelligence/document-scans/${id}`),

    applyDocumentScan: (id: string, data?: { fields?: Record<string, string> }) =>
      client.post<ApiResponse<DocumentScan>>(`/ai/intelligence/document-scans/${id}/apply`, data),

    rejectDocumentScan: (id: string, data?: { reason?: string }) =>
      client.post<ApiResponse<DocumentScan>>(`/ai/intelligence/document-scans/${id}/reject`, data),

    getSmartFollowup: async (id: string) => {
      const res = await client.get<ApiResponse<RawSmartFollowupRow>>(API_ENDPOINTS.ai.intelligence.smartFollowup(id));
      return { ...res, data: normalizeSmartFollowup(res.data) };
    },

    generateSmartFollowup: async (leadId: string) => {
      const res = await client.post<ApiResponse<RawSmartFollowupRow>>(`/ai/intelligence/smart-followup/${leadId}`);
      return { ...res, data: normalizeSmartFollowup({ ...res.data, leadId }) };
    },

    listSmartFollowups: async () => {
      const res = await client.get<ApiResponse<RawSmartFollowupRow[]>>('/ai/intelligence/smart-followups');
      return { ...res, data: (res.data ?? []).map(normalizeSmartFollowup) };
    },

    sendSmartFollowup: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/smart-followups/${id}/send`),

    dismissSmartFollowup: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/smart-followups/${id}/dismiss`),
  },

  bi: {
    getBriefing: async (params?: { type?: string; dateRange?: string }) => {
      const res = await client.get<ApiResponse<RawBriefingRow[]>>(API_ENDPOINTS.ai.bi.briefings, {
        params: { ...params, limit: 1 },
      });
      const rows = res.data ?? [];
      return { ...res, data: rows[0] ? normalizeBriefing(rows[0]) : null } as ApiResponse<
        (BriefingData & { id: string }) | null
      >;
    },

    getHealthScore: async () => {
      const res = await client.get<ApiResponse<RawHealthScoreRow>>(API_ENDPOINTS.ai.bi.healthScore);
      return { ...res, data: normalizeHealthScore(res.data) };
    },

    getDestinationProfitability: async (params?: { period?: string; limit?: number }) => {
      const res = await client.get<ApiResponse<{ rawData?: RawDestinationRow[] }>>(
        API_ENDPOINTS.ai.bi.destinationProfitability,
        { params },
      );
      return { ...res, data: normalizeDestinationProfitability(res.data.rawData ?? []) };
    },

    getSeasonalDemand: async (params?: { destination?: string }) => {
      const res = await client.get<ApiResponse<RawSeasonalDemandResponse>>(API_ENDPOINTS.ai.bi.seasonalDemand, {
        params,
      });
      return { ...res, data: normalizeSeasonalDemand(res.data) };
    },

    getCashFlowForecast: async (params?: { months?: number }) => {
      const res = await client.get<ApiResponse<RawCashFlowResponse>>(API_ENDPOINTS.ai.bi.cashFlowForecast, {
        params,
      });
      return { ...res, data: normalizeCashFlowForecast(res.data) };
    },

    getTeamPerformance: async (params?: { period?: string; limit?: number }) => {
      const res = await client.get<ApiResponse<{ rawData?: RawTeamPerformanceRow[] }>>(
        API_ENDPOINTS.ai.bi.teamPerformance,
        { params },
      );
      return { ...res, data: normalizeTeamPerformance(res.data.rawData ?? []) };
    },

    getTrendingDestinations: async (params?: { limit?: number }) => {
      const res = await client.get<ApiResponse<{ trending?: RawTrendingDestinationRow[] }>>(
        API_ENDPOINTS.ai.bi.trendingDestinations,
        { params },
      );
      const trending = normalizeTrendingDestinations(res.data.trending ?? []);
      return { ...res, data: params?.limit ? trending.slice(0, params.limit) : trending };
    },

    getLostDealAnalysis: async (params?: { period?: string; limit?: number }) => {
      const res = await client.get<ApiResponse<{ rawByReason?: RawLostDealReasonRow[] }>>(
        API_ENDPOINTS.ai.bi.lostDealAnalysis,
        { params },
      );
      return { ...res, data: normalizeLostDealAnalysis(res.data.rawByReason ?? []) };
    },

    getLeadSourceRoi: async (params?: { period?: string }) => {
      const res = await client.get<ApiResponse<RawLeadSourceRoiRow[]>>(API_ENDPOINTS.ai.bi.leadSourceRoi, {
        params,
      });
      return { ...res, data: normalizeLeadSourceRoi(res.data ?? []) };
    },

    getRevenuePulse: () =>
      client.get<ApiResponse<RevenuePulseData>>(API_ENDPOINTS.ai.bi.revenuePulse),

    getBriefingById: async (id: string) => {
      const res = await client.get<ApiResponse<RawBriefingRow>>(`/ai/bi/briefings/${id}`);
      return { ...res, data: normalizeBriefing(res.data) };
    },

    generateBriefing: async (data?: { type?: string; dateRange?: string }) => {
      const res = await client.post<ApiResponse<RawBriefingRow>>('/ai/bi/briefings/generate', data);
      return { ...res, data: normalizeBriefing(res.data) };
    },

    getHealthScoreHistory: async (params?: { limit?: number }) => {
      const res = await client.get<
        ApiResponse<Array<{ overall_score: number; calculated_at: string }>>
      >('/ai/bi/health-score/history', { params });
      const data = (res.data ?? []).map((row) => ({
        date: row.calculated_at,
        overallScore: row.overall_score,
      }));
      return { ...res, data };
    },

    calculateHealthScore: async () => {
      const res = await client.post<ApiResponse<RawHealthScoreRow>>('/ai/bi/health-score/calculate');
      return { ...res, data: normalizeHealthScore(res.data) };
    },

    getWorkloadAnalysis: () =>
      client.get<ApiResponse<WorkloadAnalysis[]>>('/ai/bi/workload-analysis'),

    getCustomerSegments: async () => {
      const res = await client.get<ApiResponse<RawCustomerSegmentRow[]>>('/ai/bi/customer-segments', {
        params: { limit: 1000 },
      });
      return { ...res, data: normalizeCustomerSegments(res.data ?? []) };
    },

    calculateCustomerSegments: () =>
      client.post<ApiResponse<{ segmented: number }>>('/ai/bi/customer-segments/calculate'),

    getCustomerLtv: async (contactId: string) => {
      const res = await client.post<ApiResponse<RawCustomerLtvResponse>>(`/ai/bi/customer-ltv/${contactId}`);
      return { ...res, data: normalizeCustomerLtv(res.data) };
    },

    generateRecommendations: (params?: { category?: string }) =>
      client.post<ApiResponse<BiRecommendation[]>>('/ai/bi/recommendations/generate', params),

    getUsage: async () => {
      const res = await client.get<ApiResponse<RawUsageResponse>>('/ai/bi/usage');
      return { ...res, data: normalizeUsage(res.data) };
    },
  },

  settings: {
    get: () =>
      client.get<ApiResponse<AiSettingsData>>(API_ENDPOINTS.ai.settings.root),

    updateFeatures: (features: Record<string, boolean>) =>
      client.put<ApiResponse<{ updated: Record<string, boolean>; denied?: string[] }>>(
        API_ENDPOINTS.ai.settings.features, { features },
      ),

    getUsage: () =>
      client.get<ApiResponse<UsageData>>(API_ENDPOINTS.ai.settings.usage),

    getProvider: () =>
      client.get<ApiResponse<AiProviderStatus & { taskRouting: Record<string, string> }>>(
        API_ENDPOINTS.ai.settings.provider,
      ),

    checkFeature: (featureKey: string) =>
      client.get<ApiResponse<{ featureKey: string; enabled: boolean; plan: string }>>(
        API_ENDPOINTS.ai.settings.featureCheck(featureKey),
      ),
  },
};
