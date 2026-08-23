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
  nextFollowUpDate: string;
  suggestedChannel?: string;
  suggestedTiming?: string;
  messageContent?: string;
  suggestedActions: string[];
  tone?: string;
  templateId?: string;
  confidence?: number;
  status?: 'pending' | 'sent' | 'dismissed';
  createdAt?: string;
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

export interface HealthScoreResult {
  overallScore: number;
  byCategory: Record<string, number>;
  trends: Record<string, number[]>;
  recommendations: string[];
}

export interface ProfitabilityAnalysis {
  destination: string;
  revenue: number;
  costs: number;
  profit: number;
  margin: number;
  trend: 'up' | 'down' | 'stable';
}

export interface SeasonalDemandData {
  month: string;
  demand: number;
  avgBooking: number;
  trending: boolean;
}

export interface CashFlowForecast {
  period: string;
  inflow: number;
  outflow: number;
  netCashFlow: number;
  balance: number;
}

export interface TeamPerformanceMetrics {
  userId: string;
  userName: string;
  dealsClosedCount: number;
  revenue: number;
  conversionRate: number;
  avgDealValue: number;
}

export interface TrendingDestination {
  name: string;
  bookings: number;
  revenue: number;
  avgDealValue: number;
  trend: 'up' | 'down';
}

export interface LostDealAnalysis {
  dealId: string;
  reason: string;
  estimatedLoss: number;
  preventionStrategy: string;
}

export interface LeadSourceRoi {
  source: string;
  leadsGenerated: number;
  dealsClosedCount: number;
  revenue: number;
  costPerLead: number;
  roi: number;
}

export interface RevenuePulseData {
  currentMonth: number;
  previousMonth: number;
  growth: number;
  projectedMonthEnd: number;
  topProductsRevenue: Array<{
    name: string;
    revenue: number;
  }>;
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

export interface CustomerLtv {
  contactId: string;
  lifetimeValue: number;
  predictedValue: number;
  bookingCount: number;
  avgBookingValue: number;
  segment?: string;
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
  byCategory: Record<string, number>;
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

  generateItinerary: (data: { destination: string; duration: number; budget?: number; preferences?: string[] }) =>
    client.post<ApiResponse<GeneratedItinerary>>(API_ENDPOINTS.ai.generateItinerary, data),

  composeMessage: (data: { context: string; tone?: string; language?: string; maxLength?: number }) =>
    client.post<ApiResponse<ComposedMessage>>(API_ENDPOINTS.ai.composeMessage, data),

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

    getLeadScore: (id: string) =>
      client.get<ApiResponse<LeadScore>>(API_ENDPOINTS.ai.intelligence.leadScore(id)),

    calculateLeadScore: (id: string) =>
      client.post<ApiResponse<LeadScore>>(API_ENDPOINTS.ai.intelligence.leadScore(id)),

    getLeadScoreHistory: (id: string) =>
      client.get<ApiResponse<LeadScoreHistoryEntry[]>>(`/ai/intelligence/lead-score/${id}/history`),

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

    getSmartFollowup: (id: string) =>
      client.get<ApiResponse<SmartFollowup>>(API_ENDPOINTS.ai.intelligence.smartFollowup(id)),

    generateSmartFollowup: (leadId: string) =>
      client.post<ApiResponse<SmartFollowup>>(`/ai/intelligence/smart-followup/${leadId}`),

    listSmartFollowups: () =>
      client.get<ApiResponse<SmartFollowup[]>>('/ai/intelligence/smart-followups'),

    sendSmartFollowup: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/smart-followups/${id}/send`),

    dismissSmartFollowup: (id: string) =>
      client.post<ApiResponse<{ id: string }>>(`/ai/intelligence/smart-followups/${id}/dismiss`),
  },

  bi: {
    getBriefing: (params?: { type?: string; dateRange?: string }) =>
      client.get<ApiResponse<BriefingData>>(API_ENDPOINTS.ai.bi.briefings, { params }),

    getHealthScore: () =>
      client.get<ApiResponse<HealthScoreResult>>(API_ENDPOINTS.ai.bi.healthScore),

    getDestinationProfitability: (params?: { period?: string; limit?: number }) =>
      client.get<ApiResponse<ProfitabilityAnalysis[]>>(API_ENDPOINTS.ai.bi.destinationProfitability, { params }),

    getSeasonalDemand: (params?: { destination?: string }) =>
      client.get<ApiResponse<SeasonalDemandData[]>>(API_ENDPOINTS.ai.bi.seasonalDemand, { params }),

    getCashFlowForecast: (params?: { months?: number }) =>
      client.get<ApiResponse<CashFlowForecast[]>>(API_ENDPOINTS.ai.bi.cashFlowForecast, { params }),

    getTeamPerformance: (params?: { period?: string; limit?: number }) =>
      client.get<ApiResponse<TeamPerformanceMetrics[]>>(API_ENDPOINTS.ai.bi.teamPerformance, { params }),

    getTrendingDestinations: (params?: { limit?: number }) =>
      client.get<ApiResponse<TrendingDestination[]>>(API_ENDPOINTS.ai.bi.trendingDestinations, { params }),

    getLostDealAnalysis: (params?: { period?: string; limit?: number }) =>
      client.get<ApiResponse<LostDealAnalysis[]>>(API_ENDPOINTS.ai.bi.lostDealAnalysis, { params }),

    getLeadSourceRoi: (params?: { period?: string }) =>
      client.get<ApiResponse<LeadSourceRoi[]>>(API_ENDPOINTS.ai.bi.leadSourceRoi, { params }),

    getRevenuePulse: () =>
      client.get<ApiResponse<RevenuePulseData>>(API_ENDPOINTS.ai.bi.revenuePulse),

    getBriefingById: (id: string) =>
      client.get<ApiResponse<BriefingData & { id: string }>>(`/ai/bi/briefings/${id}`),

    generateBriefing: (data?: { type?: string; dateRange?: string }) =>
      client.post<ApiResponse<BriefingData & { id: string }>>('/ai/bi/briefings/generate', data),

    getHealthScoreHistory: (params?: { limit?: number }) =>
      client.get<ApiResponse<HealthScoreHistoryEntry[]>>('/ai/bi/health-score/history', { params }),

    calculateHealthScore: () =>
      client.post<ApiResponse<HealthScoreResult>>('/ai/bi/health-score/calculate'),

    getWorkloadAnalysis: () =>
      client.get<ApiResponse<WorkloadAnalysis[]>>('/ai/bi/workload-analysis'),

    getCustomerSegments: () =>
      client.get<ApiResponse<CustomerSegment[]>>('/ai/bi/customer-segments'),

    calculateCustomerSegments: () =>
      client.post<ApiResponse<CustomerSegment[]>>('/ai/bi/customer-segments/calculate'),

    getCustomerLtv: (contactId: string) =>
      client.post<ApiResponse<CustomerLtv>>(`/ai/bi/customer-ltv/${contactId}`),

    generateRecommendations: (params?: { category?: string }) =>
      client.post<ApiResponse<BiRecommendation[]>>('/ai/bi/recommendations/generate', params),

    getUsage: () =>
      client.get<ApiResponse<UsageData>>('/ai/bi/usage'),
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
