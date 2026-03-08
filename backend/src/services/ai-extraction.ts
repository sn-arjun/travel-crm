/**
 * AI Extraction Service — TICKET-399, 402, 403, 406, 407, 409
 *
 * Uses Claude Haiku to extract structured travel data from call transcripts.
 * Combined extraction: lead data + summary + topics + action items +
 * sentiment + deal likelihood + coaching hints — all in a single API call.
 */

import type { Env } from '../types';

export interface ExtractionResult {
  // Lead data
  destination: string | null;
  travelDates: { from: string; to: string; flexible: boolean } | null;
  paxCount: number | null;
  paxDetails: { adults: number; children: number; infants: number } | null;
  budget: number | null;
  budgetCurrency: string;
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

const EXTRACTION_SYSTEM_PROMPT = `You are an AI assistant for a travel agency CRM. Analyze the call transcript and extract ALL relevant information in a single JSON response.

Extract the following:
1. **Lead Data**: destination, travel dates, number of travelers, budget, preferences, trip type, hotel preference, meal preference, special requests
2. **Summary**: 3-5 bullet point summary of the call
3. **Key Topics**: list of main topics discussed (as short phrases)
4. **Action Items**: tasks that need follow-up (with suggested assignee and due date if mentioned)
5. **Sentiment**: overall customer sentiment (positive/neutral/negative/urgent)
6. **Deal Likelihood**: probability of conversion (0.0-1.0) based on buying signals
7. **Coaching Hints**: 1-2 specific, constructive tips for the agent's improvement

For confidence scores: 1.0 = explicitly stated, 0.7 = strongly implied, 0.4 = loosely inferred, 0.0 = not mentioned.

Respond ONLY with valid JSON matching this schema:
{
  "destination": "string or null",
  "travel_dates": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "flexible": true} or null,
  "pax_count": number or null,
  "pax_details": {"adults": 2, "children": 1, "infants": 0} or null,
  "budget": number or null,
  "budget_currency": "INR",
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
  "overall_confidence": 0.0 to 1.0,
  "field_confidences": {"destination": 0.9, "budget": 0.7, ...}
}`;

export class AIExtractionService {
  constructor(private env: Env) {}

  /**
   * Extract all structured data from a transcript in a single Claude call.
   */
  async extractFromTranscript(
    transcript: string,
    agentName?: string,
  ): Promise<ExtractionResult> {
    const userMessage = agentName
      ? `Agent name: ${agentName}\n\nCall transcript:\n${transcript}`
      : `Call transcript:\n${transcript}`;

    // Truncate very long transcripts to stay within token limits
    const maxChars = 12000;
    const truncated = userMessage.length > maxChars
      ? userMessage.substring(0, maxChars) + '\n\n[Transcript truncated]'
      : userMessage;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: truncated }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text || '{}';
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;

    // Cost: Haiku 4.5 — $0.80/MTok input, $4.00/MTok output
    const costEstimate =
      (inputTokens * 0.0000008) + (outputTokens * 0.000004);

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
      budgetCurrency: parsed.budget_currency || 'INR',
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
      overallConfidence: parsed.overall_confidence ?? 0,
      fieldConfidences: parsed.field_confidences || {},
      modelUsed: 'claude-haiku-4-5-20251001',
      inputTokens,
      outputTokens,
      costEstimate,
    };
  }
}
