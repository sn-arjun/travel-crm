/**
 * AI Model Router — TICKET-411
 *
 * Routes AI tasks to the cheapest capable model.
 * Tracks token usage and costs per tenant.
 */

import type { Env } from '../types';
import { generateId } from '../utils/uuid';

export type AITask = 'sentiment' | 'summary' | 'extraction' | 'coaching' | 'deal_likelihood' | 'transcription'
  | 'lead_extraction' | 'whatsapp_parse' | 'email_parse' | 'business_card_ocr' | 'bulk_lead_extraction'
  | 'itinerary' | 'itinerary_enrichment' | 'invoice' | 'communication' | 'smart_reply'
  | 'itinerary_generation' | 'invoice_generation' | 'communication_compose'
  | 'nl_query' | 'customer_insight' | 'trend_detection' | 'lead_scoring' | 'anomaly_detection'
  | 'passport_ocr' | 'visa_classification' | 'supplier_invoice_ocr' | 'followup_timing'
  | 'followup_channel' | 'followup_content' | 'escalation_detection' | 'conversational_analytics'
  | 'predictive_suggestion' | 'score_explanation'
  | 'daily_briefing' | 'weekly_briefing' | 'monthly_briefing'
  | 'destination_profitability' | 'seasonal_demand' | 'customer_ltv' | 'cash_flow_forecast'
  | 'salesperson_scoring' | 'call_quality_scoring' | 'coaching_recommendation' | 'workload_analysis'
  | 'customer_segmentation' | 'next_trip_prediction' | 'churn_scoring' | 'trending_destinations'
  | 'lost_deal_analysis' | 'lead_source_roi' | 'business_health_score'
  | 'revenue_pulse' | 'ai_recommendation_gen'
  | 'social_content_instagram' | 'social_content_facebook' | 'social_content_linkedin'
  | 'social_content_twitter' | 'social_content_blog'
  | 'marketing_suggestion' | 'whatsapp_campaign_template';

interface ModelConfig {
  provider: 'anthropic';
  model: string;
  maxTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
}

export interface AIResponse {
  result: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

const DEFAULT_ROUTING: Partial<Record<AITask, ModelConfig>> = {
  sentiment: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 256,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
  summary: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 512,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
  extraction: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
  coaching: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 256,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
  deal_likelihood: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 256,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  },
  transcription: {
    provider: 'anthropic',
    model: 'deepgram-nova-2',
    maxTokens: 0,
    costPerInputToken: 0,
    costPerOutputToken: 0,
  },
};

export class AIRouter {
  private routing: Partial<Record<AITask, ModelConfig>>;

  private static readonly FALLBACK_CONFIG: ModelConfig = {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2048,
    costPerInputToken: 0.0000008,
    costPerOutputToken: 0.000004,
  };

  constructor(
    private env: Env,
    tenantOverrides?: Partial<Record<AITask, Partial<ModelConfig>>>,
  ) {
    this.routing = { ...DEFAULT_ROUTING };
    if (tenantOverrides) {
      for (const [task, config] of Object.entries(tenantOverrides)) {
        if (config) {
          const existing = this.routing[task as AITask] || AIRouter.FALLBACK_CONFIG;
          this.routing[task as AITask] = { ...existing, ...config } as ModelConfig;
        }
      }
    }
  }

  /**
   * Route an AI task to the configured model and return the result.
   */
  async route(
    task: AITask,
    input: string,
    systemPrompt: string,
  ): Promise<AIResponse> {
    const config = this.routing[task] || AIRouter.FALLBACK_CONFIG;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: input }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Router error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cost =
      inputTokens * config.costPerInputToken +
      outputTokens * config.costPerOutputToken;

    const text =
      data.content?.[0]?.type === 'text' ? data.content[0].text : '';

    return {
      result: text,
      model: config.model,
      inputTokens,
      outputTokens,
      cost,
    };
  }

  /**
   * Log AI usage to the database for cost tracking.
   */
  async logUsage(
    db: D1Database,
    taskType: AITask,
    modelName: string,
    inputTokens: number,
    outputTokens: number,
    cost: number,
    callLogId?: string,
    durationMs?: number,
    success?: boolean,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const id = generateId();
      await db
        .prepare(
          `INSERT INTO ai_usage_log (id, task_type, model_name, input_tokens, output_tokens, cost_estimate, call_log_id, duration_ms, success, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          taskType,
          modelName,
          inputTokens,
          outputTokens,
          cost,
          callLogId || null,
          durationMs || 0,
          success !== false ? 1 : 0,
          errorMessage || null,
        )
        .run();
    } catch (e) {
      console.error('Failed to log AI usage:', e);
    }
  }

  getModelConfig(task: AITask): ModelConfig {
    return this.routing[task] || AIRouter.FALLBACK_CONFIG;
  }
}
