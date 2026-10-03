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
import { aiApi } from './ai';

describe('aiApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── conversations ─────────────────────────────────────────────
  describe('conversations', () => {
    describe('list', () => {
      it('should call GET /ai/conversations', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [] } });
        await aiApi.conversations.list();
        expect(client.get).toHaveBeenCalledWith('/ai/conversations', { params: undefined });
      });

      it('should pass pagination', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [] } });
        await aiApi.conversations.list({ page: 1, limit: 10 });
        expect(client.get).toHaveBeenCalledWith('/ai/conversations', { params: { page: 1, limit: 10 } });
      });

      it('should return conversations list', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { data: [{ id: 'conv1', title: 'Chat 1' }] } });
        const result = await aiApi.conversations.list();
        expect(result.data.data).toHaveLength(1);
      });
    });

    describe('getById', () => {
      it('should call GET /ai/conversations/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { id: 'conv1', title: 'Chat' } });
        await aiApi.conversations.getById('conv1');
        expect(client.get).toHaveBeenCalledWith('/ai/conversations/conv1');
      });
    });

    describe('create', () => {
      it('should call POST /ai/conversations', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { id: 'conv1' } });
        await aiApi.conversations.create({ title: 'New Chat' });
        expect(client.post).toHaveBeenCalledWith('/ai/conversations', { title: 'New Chat' });
      });
    });
  });

  // ─── extractLead ───────────────────────────────────────────────
  describe('extractLead', () => {
    it('should call POST /ai/extract-lead', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { firstName: 'John', confidence: 0.95 } });
      await aiApi.extractLead({ text: 'John Doe wants to visit Bali' });
      expect(client.post).toHaveBeenCalledWith('/ai/extract-lead', { text: 'John Doe wants to visit Bali' });
    });

    it('should pass sourceUrl', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await aiApi.extractLead({ text: 'Lead from web', sourceUrl: 'https://example.com' });
      expect(client.post).toHaveBeenCalledWith('/ai/extract-lead', { text: 'Lead from web', sourceUrl: 'https://example.com' });
    });

    it('should return extracted lead', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { firstName: 'Jane', email: 'jane@test.com', confidence: 0.8 } });
      const result = await aiApi.extractLead({ text: 'Jane jane@test.com' });
      expect(result.data.firstName).toBe('Jane');
      expect(result.data.confidence).toBe(0.8);
    });
  });

  // ─── generateItinerary ─────────────────────────────────────────
  describe('generateItinerary', () => {
    it('should call POST /ai/generate-itinerary', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { title: 'Bali 5D', items: [] } });
      await aiApi.generateItinerary({ prompt: 'Relaxed beach holiday', destination: 'Bali', duration: 5 });
      expect(client.post).toHaveBeenCalledWith('/ai/generate-itinerary', { prompt: 'Relaxed beach holiday', destination: 'Bali', duration: 5 });
    });

    it('should pass budget and preferences', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await aiApi.generateItinerary({ prompt: 'Culture and food week', destination: 'Paris', duration: 7, budget: 50000, preferences: ['culture', 'food'] });
      expect(client.post).toHaveBeenCalledWith('/ai/generate-itinerary', { prompt: 'Culture and food week', destination: 'Paris', duration: 7, budget: 50000, preferences: ['culture', 'food'] });
    });

    it('should return generated itinerary', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { title: 'Trip', items: [{ day: 1, title: 'Arrival' }] } });
      const result = await aiApi.generateItinerary({ prompt: 'Short city break', destination: 'Tokyo', duration: 3 });
      expect(result.data.items).toHaveLength(1);
    });
  });

  // ─── composeMessage ────────────────────────────────────────────
  describe('composeMessage', () => {
    it('should call POST /ai/compose-message', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { body: 'Hello!' } });
      await aiApi.composeMessage({ channel: 'whatsapp', purpose: 'Follow up on booking inquiry' });
      expect(client.post).toHaveBeenCalledWith('/ai/compose-message', { channel: 'whatsapp', purpose: 'Follow up on booking inquiry' });
    });

    it('should pass tone and language', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      await aiApi.composeMessage({ channel: 'email', purpose: 'Thank customer', tone: 'professional', language: 'en' });
      expect(client.post).toHaveBeenCalledWith('/ai/compose-message', { channel: 'email', purpose: 'Thank customer', tone: 'professional', language: 'en' });
    });

    it('should pass structured context', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: {} });
      const context = { customerName: 'Asha Rao', destination: 'Goa', leadStatus: 'quoted' };
      await aiApi.composeMessage({ channel: 'sms', purpose: 'Brief reply', context });
      expect(client.post).toHaveBeenCalledWith('/ai/compose-message', { channel: 'sms', purpose: 'Brief reply', context });
    });
  });

  // ─── suggestReplies ────────────────────────────────────────────
  describe('suggestReplies', () => {
    it('should call POST /ai/suggest-replies', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { suggestions: [{ text: 'Sure!', confidence: 0.9 }] } });
      await aiApi.suggestReplies({ message: 'Can I book for next week?' });
      expect(client.post).toHaveBeenCalledWith('/ai/suggest-replies', { message: 'Can I book for next week?' });
    });

    it('should pass context', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { suggestions: [] } });
      await aiApi.suggestReplies({ message: 'What is the price?', context: 'Bali trip inquiry' });
      expect(client.post).toHaveBeenCalledWith('/ai/suggest-replies', { message: 'What is the price?', context: 'Bali trip inquiry' });
    });

    it('should return suggestions', async () => {
      vi.mocked(client.post).mockResolvedValue({ data: { suggestions: [{ text: 'Reply 1' }, { text: 'Reply 2' }] } });
      const result = await aiApi.suggestReplies({ message: 'Hello' });
      expect(result.data.suggestions).toHaveLength(2);
    });
  });

  // ─── intelligence ──────────────────────────────────────────────
  describe('intelligence', () => {
    describe('nlQuery', () => {
      it('should call POST /ai/intelligence/nl-query', async () => {
        vi.mocked(client.post).mockResolvedValue({ data: { query: 'test', response: 'result' } });
        await aiApi.intelligence.nlQuery({ query: 'How many leads this month?' });
        expect(client.post).toHaveBeenCalledWith('/ai/intelligence/nl-query', { query: 'How many leads this month?' });
      });
    });

    describe('getInsights', () => {
      it('should call GET /ai/intelligence/insights', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.intelligence.getInsights();
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/insights', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.intelligence.getInsights({ type: 'revenue', limit: 5 });
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/insights', { params: { type: 'revenue', limit: 5 } });
      });
    });

    describe('getRecommendations', () => {
      it('should call GET /ai/intelligence/recommendations', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.intelligence.getRecommendations();
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/recommendations', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.intelligence.getRecommendations({ category: 'sales', priority: 'high' });
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/recommendations', { params: { category: 'sales', priority: 'high' } });
      });
    });

    describe('getLeadScore', () => {
      it('should call GET /ai/intelligence/lead-score/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { score: 85, factors: [] } });
        await aiApi.intelligence.getLeadScore('l1');
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/lead-score/l1');
      });

      it('should return score data', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { score: 92, factors: [{ name: 'budget', weight: 0.3, contribution: 28 }] } });
        const result = await aiApi.intelligence.getLeadScore('l1');
        expect(result.data?.score).toBe(92);
      });
    });

    describe('ocrPassport', () => {
      it('should call POST /ai/intelligence/ocr/passport with FormData', async () => {
        const file = new File(['img'], 'passport.jpg');
        vi.mocked(client.post).mockResolvedValue({ data: { firstName: 'John', confidence: 0.95 } });
        await aiApi.intelligence.ocrPassport(file);
        expect(client.post).toHaveBeenCalledWith('/ai/intelligence/ocr/passport', expect.any(FormData));
      });
    });

    describe('ocrVisaClassify', () => {
      it('should call POST /ai/intelligence/ocr/visa-classify with FormData', async () => {
        const file = new File(['img'], 'visa.jpg');
        vi.mocked(client.post).mockResolvedValue({ data: { country: 'USA', confidence: 0.9 } });
        await aiApi.intelligence.ocrVisaClassify(file);
        expect(client.post).toHaveBeenCalledWith('/ai/intelligence/ocr/visa-classify', expect.any(FormData));
      });
    });

    describe('ocrSupplierInvoice', () => {
      it('should call POST /ai/intelligence/ocr/supplier-invoice with FormData', async () => {
        const file = new File(['pdf'], 'invoice.pdf');
        vi.mocked(client.post).mockResolvedValue({ data: { supplierName: 'Taj', confidence: 0.88 } });
        await aiApi.intelligence.ocrSupplierInvoice(file);
        expect(client.post).toHaveBeenCalledWith('/ai/intelligence/ocr/supplier-invoice', expect.any(FormData));
      });
    });

    describe('getSmartFollowup', () => {
      it('should call GET /ai/intelligence/smart-followup/:id', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { nextFollowUpDate: '2026-03-15', suggestedActions: ['Call'] } });
        await aiApi.intelligence.getSmartFollowup('l1');
        expect(client.get).toHaveBeenCalledWith('/ai/intelligence/smart-followup/l1');
      });
    });
  });

  // ─── bi ────────────────────────────────────────────────────────
  describe('bi', () => {
    describe('getBriefing', () => {
      it('should call GET /ai/bi/briefings', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getBriefing();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/briefings', { params: { limit: 1 } });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getBriefing({ type: 'daily', dateRange: 'today' });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/briefings', { params: { type: 'daily', dateRange: 'today', limit: 1 } });
      });
    });

    describe('getHealthScore', () => {
      it('should call GET /ai/bi/health-score', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { overallScore: 85 } });
        await aiApi.bi.getHealthScore();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/health-score');
      });
    });

    describe('getDestinationProfitability', () => {
      it('should call GET /ai/bi/destination-profitability', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getDestinationProfitability();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/destination-profitability', { params: undefined });
      });

      it('should pass params', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getDestinationProfitability({ period: 'quarterly', limit: 10 });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/destination-profitability', { params: { period: 'quarterly', limit: 10 } });
      });
    });

    describe('getSeasonalDemand', () => {
      it('should call GET /ai/bi/seasonal-demand', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getSeasonalDemand({ destination: 'Bali' });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/seasonal-demand', { params: { destination: 'Bali' } });
      });
    });

    describe('getCashFlowForecast', () => {
      it('should call GET /ai/bi/cash-flow-forecast', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getCashFlowForecast({ months: 6 });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/cash-flow-forecast', { params: { months: 6 } });
      });
    });

    describe('getTeamPerformance', () => {
      it('should call GET /ai/bi/team-performance', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getTeamPerformance();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/team-performance', { params: undefined });
      });
    });

    describe('getTrendingDestinations', () => {
      it('should call GET /ai/bi/trending-destinations', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getTrendingDestinations({ limit: 5 });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/trending-destinations', { params: { limit: 5 } });
      });
    });

    describe('getLostDealAnalysis', () => {
      it('should call GET /ai/bi/lost-deal-analysis', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getLostDealAnalysis();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/lost-deal-analysis', { params: undefined });
      });
    });

    describe('getLeadSourceRoi', () => {
      it('should call GET /ai/bi/lead-source-roi', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: [] });
        await aiApi.bi.getLeadSourceRoi({ period: 'monthly' });
        expect(client.get).toHaveBeenCalledWith('/ai/bi/lead-source-roi', { params: { period: 'monthly' } });
      });
    });

    describe('getRevenuePulse', () => {
      it('should call GET /ai/bi/revenue-pulse', async () => {
        vi.mocked(client.get).mockResolvedValue({ data: { currentMonth: 100000, growth: 15 } });
        await aiApi.bi.getRevenuePulse();
        expect(client.get).toHaveBeenCalledWith('/ai/bi/revenue-pulse');
      });
    });
  });
});
