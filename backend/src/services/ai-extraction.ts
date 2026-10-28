/**
 * AI Extraction Service — TICKET-399, 402, 403, 406, 407, 409
 *
 * Extracts structured travel data from call transcripts through the AI router (R306): metered in the agency's AI credits,
 * Workers AI JSON model by default. No provider is called directly from here.
 * Combined extraction: lead data + summary + topics + action items +
 * sentiment + deal likelihood + coaching hints — all in a single model call.
 */

import type { Env } from '../types';
import { AIRouter } from './ai-router';

export interface ExtractionResult {
  // Lead data
  destination: string | null;
  travelDates: { from: string; to: string; flexible: boolean } | null;
  paxCount: number | null;
  paxDetails: { adults: number; children: number; infants: number } | null;
  budget: number | null;
  /** ISO 4217 code the caller named, else the agency currency when the caller passed it, else null. */
  budgetCurrency: string | null;
  preferences: string[];
  tripType: string | null;
  hotelPreference: string | null;
  mealPreference: string | null;
  specialRequests: string | null;
  // Analysis
  summary: string[];
  keyTopics: string[];
  actionItems: ActionItem[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  sentimentScore: number;
  dealLikelihood: number;
  likelihoodSignals: string[];
  coachingHints: string[];
  /** A short polite message the agent could send after the call (a suggestion; never sent by itself). */
  draftReply?: string | null;
  // Confidence
  overallConfidence: number;
  fieldConfidences: Record<string, number>;
  // Usage
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
}

export interface ActionItem {
  text: string;
  assignee?: string;
  dueDate?: string;
  completed: boolean;
}

/** The prompt example shows the agency currency, so a call that names no currency is read in it. */
function buildExtractionPrompt(currency?: string): string {
  const budgetCurrency = currency ? `"${currency}"` : 'null';
  return `You are an AI assistant for a travel agency CRM. Analyze the call transcript and extract ALL relevant information in a single JSON response.

Extract the following:
1. **Lead Data**: destination, travel dates, number of travelers, budget, preferences, trip type, hotel preference, meal preference, special requests
2. **Summary**: 3-5 bullet point summary of the call
3. **Key Topics**: list of main topics discussed (as short phrases)
4. **Action Items**: tasks that need follow-up (with suggested assignee and due date if mentioned)
5. **Sentiment**: overall customer sentiment (positive/neutral/negative/urgent)
6. **Deal Likelihood**: probability of conversion (0.0-1.0) based on buying signals
7. **Coaching Hints**: 1-2 specific, constructive tips for the agent's improvement
8. **Draft Reply**: a warm 2-3 sentence message the agent could send the customer after the call; no prices, no promises about availability; null when nothing needs sending

For confidence scores: 1.0 = explicitly stated, 0.7 = strongly implied, 0.4 = loosely inferred, 0.0 = not mentioned.

Respond ONLY with valid JSON matching this schema:
{
  "destination": "string or null",
  "travel_dates": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "flexible": true} or null,
  "pax_count": number or null,
  "pax_details": {"adults": 2, "children": 1, "infants": 0} or null,
  "budget": number or null,
  "budget_currency": ${budgetCurrency},
  "preferences": ["string"],
  "trip_type": "honeymoon|family|adventure|business|group|pilgrimage|luxury" or null,
  "hotel_preference": "budget|mid-range|luxury" or null,
  "meal_preference": "string" or null,
  "special_requests": "string" or null,
  "summary": ["bullet 1", "bullet 2", "bullet 3"],
  "key_topics": ["topic1", "topic2"],
  "action_items": [{"text": "...", "assignee": "agent name or null", "due_date": "YYYY-MM-DD or null", "completed": false}],
  "sentiment": "positive|neutral|negative|urgent",
  "sentiment_score": 0.0 to 1.0,
  "deal_likelihood": 0.0 to 1.0,
  "likelihood_signals": ["signal1", "signal2"],
  "coaching_hints": ["hint1", "hint2"],
  "draft_reply": "string or null",
  "overall_confidence": 0.0 to 1.0,
  "field_confidences": {"destination": 0.9, "budget": 0.7, ...}
}`;
}

export class AIExtractionService {
  private router: AIRouter;

  /**
   * @param tenantId when given, the call checks and charges that agency's AI credits.
   * @param router injectable for tests; defaults to a router built from the environment.
   */
  constructor(private env: Env, tenantId?: string, router?: AIRouter) {
    this.router = router ?? new AIRouter(env, undefined, tenantId);
  }

  /**
   * Extract all structured data from a transcript in a single model call.
   * `units` is the number of credit units to charge (started 5-minute blocks of the call).
   */
  async extractFromTranscript(
    transcript: string,
    agentName?: string,
    options: { units?: number; currency?: string } = {},
  ): Promise<ExtractionResult> {
    const userMessage = agentName
      ? `Agent name: ${agentName}\n\nCall transcript:\n${transcript}`
      : `Call transcript:\n${transcript}`;

    // Truncate very long transcripts to stay within token limits
    const maxChars = 12000;
    const truncated = userMessage.length > maxChars
      ? userMessage.substring(0, maxChars) + '\n\n[Transcript truncated]'
      : userMessage;

    const response = await this.router.route('call_summary', truncated, buildExtractionPrompt(options.currency), { units: options.units ?? 1 });
    const text = response.result || '{}';
    const inputTokens = response.inputTokens;
    const outputTokens = response.outputTokens;
    const costEstimate = response.cost;

    let parsed: any;
    try {
      // Handle potential markdown code blocks in response
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse extraction JSON:', text);
      parsed = {};
    }

    return {
      destination: parsed.destination || null,
      travelDates: parsed.travel_dates || null,
      paxCount: parsed.pax_count ?? null,
      paxDetails: parsed.pax_details || null,
      budget: parsed.budget ?? null,
      budgetCurrency: parsed.budget_currency || options.currency || null,
      preferences: parsed.preferences || [],
      tripType: parsed.trip_type || null,
      hotelPreference: parsed.hotel_preference || null,
      mealPreference: parsed.meal_preference || null,
      specialRequests: parsed.special_requests || null,
      summary: parsed.summary || [],
      keyTopics: parsed.key_topics || [],
      actionItems: (parsed.action_items || []).map((a: any) => ({
        text: a.text || '',
        assignee: a.assignee || undefined,
        dueDate: a.due_date || undefined,
        completed: false,
      })),
      sentiment: parsed.sentiment || 'neutral',
      sentimentScore: parsed.sentiment_score ?? 0,
      dealLikelihood: parsed.deal_likelihood ?? 0,
      likelihoodSignals: parsed.likelihood_signals || [],
      coachingHints: parsed.coaching_hints || [],
      draftReply: typeof parsed.draft_reply === 'string' && parsed.draft_reply.trim() ? parsed.draft_reply.trim().slice(0, 1500) : null,
      overallConfidence: parsed.overall_confidence ?? 0,
      fieldConfidences: parsed.field_confidences || {},
      modelUsed: response.model,
      inputTokens,
      outputTokens,
      costEstimate,
    };
  }
}
