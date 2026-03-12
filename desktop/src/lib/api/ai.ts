import { client, type ApiResponse } from './client';
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
  score: number;
  factors: Array<{
    name: string;
    weight: number;
    contribution: number;
  }>;
  recommendation?: string;
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
  nextFollowUpDate: string;
  suggestedActions: string[];
  tone?: string;
  templateId?: string;
}

export interface NlQueryResult {
  query: string;
  response: string;
  data?: Record<string, unknown>;
  visualizations?: Array<{
    type: string;
    config: Record<string, unknown>;
  }>;
}

export interface Insight {
  title: string;
  description: string;
  metric: string;
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
  recommendation?: string;
}

export interface Recommendation {
  category: string;
  title: string;
  description: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
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

export const aiApi = {
  conversations: {
    list: (params?: { page?: number; limit?: number }) =>
      client.get<ApiResponse<{ data: AiConversation[] }>>(API_ENDPOINTS.ai.conversations, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<AiConversation>>(`${API_ENDPOINTS.ai.conversations}/${id}`),

    create: (data: { title: string }) =>
      client.post<ApiResponse<AiConversation>>(API_ENDPOINTS.ai.conversations, data),
  },

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

    getInsights: (params?: { type?: string; limit?: number }) =>
      client.get<ApiResponse<Insight[]>>(API_ENDPOINTS.ai.intelligence.insights, { params }),

    getRecommendations: (params?: { category?: string; priority?: string; limit?: number }) =>
      client.get<ApiResponse<Recommendation[]>>(API_ENDPOINTS.ai.intelligence.recommendations, { params }),

    getLeadScore: (id: string) =>
      client.get<ApiResponse<LeadScore>>(API_ENDPOINTS.ai.intelligence.leadScore(id)),

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

    getSmartFollowup: (id: string) =>
      client.get<ApiResponse<SmartFollowup>>(API_ENDPOINTS.ai.intelligence.smartFollowup(id)),
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
