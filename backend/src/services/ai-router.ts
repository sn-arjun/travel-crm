/**
 * AI Model Router — TICKET-411
 *
 * Routes AI tasks to the appropriate provider:
 *   1. Cloudflare Workers AI (default, free/included with Workers plan)
 *   2. Anthropic Claude API (when ANTHROPIC_API_KEY is set in env)
 *
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

export type AIProvider = 'cloudflare' | 'anthropic';

export interface ModelConfig {
  provider: AIProvider;
  model: string;
  maxTokens: number;
  costPerInputToken: number;  // USD per token
  costPerOutputToken: number; // USD per token
}

export interface AIResponse {
  result: string;
  model: string;
  provider: AIProvider;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

// Vision tasks that require image processing — these prefer Claude API
const VISION_TASKS: Set<AITask> = new Set([
  'business_card_ocr', 'passport_ocr', 'visa_classification', 'supplier_invoice_ocr',
]);

// Cloudflare Workers AI models
const CF_TEXT_MODEL = '@cf/meta/llama-3.1-70b-instruct';
const CF_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

// Anthropic models
const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';

// Cloudflare AI is included in Workers plan — effectively $0 for bundled usage
// Anthropic Haiku: $0.80/MTok input, $4.00/MTok output
const CF_CONFIG: ModelConfig = {
  provider: 'cloudflare',
  model: CF_TEXT_MODEL,
  maxTokens: 2048,
  costPerInputToken: 0,
  costPerOutputToken: 0,
};

const CF_VISION_CONFIG: ModelConfig = {
  provider: 'cloudflare',
  model: CF_VISION_MODEL,
  maxTokens: 1024,
  costPerInputToken: 0,
  costPerOutputToken: 0,
};

const CLAUDE_CONFIG: ModelConfig = {
  provider: 'anthropic',
  model: CLAUDE_HAIKU,
  maxTokens: 2048,
  costPerInputToken: 0.0000008,
  costPerOutputToken: 0.000004,
};

const CLAUDE_VISION_CONFIG: ModelConfig = {
  provider: 'anthropic',
  model: CLAUDE_HAIKU,
  maxTokens: 1024,
  costPerInputToken: 0.0000008,
  costPerOutputToken: 0.000004,
};

// Tasks that benefit from larger context / better reasoning — use Claude when available
const PREFER_CLAUDE_TASKS: Set<AITask> = new Set([
  'itinerary', 'itinerary_generation', 'itinerary_enrichment',
  'invoice', 'invoice_generation',
  'daily_briefing', 'weekly_briefing', 'monthly_briefing',
  'nl_query', 'customer_insight', 'customer_ltv',
  'business_health_score', 'ai_recommendation_gen',
]);

export class AIRouter {
  private env: Env;
  private hasAnthropicKey: boolean;
  private tenantOverrides?: Partial<Record<AITask, Partial<ModelConfig>>>;

  constructor(
    env: Env,
    tenantOverrides?: Partial<Record<AITask, Partial<ModelConfig>>>,
  ) {
    this.env = env;
    this.hasAnthropicKey = !!env.ANTHROPIC_API_KEY;
    this.tenantOverrides = tenantOverrides;
  }

  /**
   * Determine the best model config for a task.
   * Priority: tenant override > Claude (if key present and preferred) > Cloudflare AI
   */
  getModelConfig(task: AITask): ModelConfig {
    // Check tenant overrides first
    if (this.tenantOverrides?.[task]) {
      const base = this.resolveBaseConfig(task);
      return { ...base, ...this.tenantOverrides[task] } as ModelConfig;
    }
    return this.resolveBaseConfig(task);
  }

  private resolveBaseConfig(task: AITask): ModelConfig {
    const isVision = VISION_TASKS.has(task);
    const preferClaude = PREFER_CLAUDE_TASKS.has(task);

    // If ANTHROPIC_API_KEY is set, use Claude for preferred tasks and all vision
    if (this.hasAnthropicKey) {
      if (isVision) return CLAUDE_VISION_CONFIG;
      if (preferClaude) return CLAUDE_CONFIG;
      // For simple tasks, still use Cloudflare AI to save costs
      return CF_CONFIG;
    }

    // No Anthropic key — use Cloudflare AI for everything
    if (isVision) return CF_VISION_CONFIG;
    return CF_CONFIG;
  }

  /**
   * Route an AI task to the configured model and return the result.
   */
  async route(
    task: AITask,
    input: string,
    systemPrompt: string,
  ): Promise<AIResponse> {
    const config = this.getModelConfig(task);

    if (config.provider === 'anthropic') {
      return this.routeAnthropic(config, input, systemPrompt);
    }
    return this.routeCloudflare(config, input, systemPrompt);
  }

  /**
   * Route a vision task (image + text) to the appropriate provider.
   */
  async routeVision(
    task: AITask,
    imageBase64: string,
    mimeType: string,
    textPrompt: string,
  ): Promise<AIResponse> {
    const config = this.getModelConfig(task);

    if (config.provider === 'anthropic') {
      return this.routeAnthropicVision(config, imageBase64, mimeType, textPrompt);
    }
    return this.routeCloudflareVision(config, imageBase64, textPrompt);
  }

  // ── Cloudflare Workers AI ──────────────────────────────

  private async routeCloudflare(
    config: ModelConfig,
    input: string,
    systemPrompt: string,
  ): Promise<AIResponse> {
    // If AI binding is not available (e.g., local dev without CF AI), return a stub response
    if (!this.env.AI) {
      const stub = `{"note":"Cloudflare AI not available in this environment. Configure Workers AI binding."}`;
      return {
        result: stub,
        model: config.model,
        provider: 'cloudflare',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input },
    ];

    let response: any;
    try {
      response = await this.env.AI.run(config.model as any, {
        messages,
        max_tokens: config.maxTokens,
        temperature: 0.3,
      });
    } catch (aiErr) {
      // AI binding is present but not functional (e.g. local dev stub with --local flag)
      // Return empty string so any downstream JSON.parse() uses its fallback
      console.warn('[AI Router] Cloudflare AI run failed (likely --local mode):', (aiErr as Error).message);
      return {
        result: '',
        model: config.model,
        provider: 'cloudflare',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }

    const text = response?.response || response?.result || '';
    // Cloudflare AI doesn't provide detailed token counts, estimate from text length
    const inputTokens = Math.ceil((systemPrompt.length + input.length) / 4);
    const outputTokens = Math.ceil(text.length / 4);

    return {
      result: text,
      model: config.model,
      provider: 'cloudflare',
      inputTokens,
      outputTokens,
      cost: 0, // Cloudflare AI bundled with Workers plan
    };
  }

  private async routeCloudflareVision(
    config: ModelConfig,
    imageBase64: string,
    textPrompt: string,
  ): Promise<AIResponse> {
    // If AI binding is not available, return a stub response
    if (!this.env.AI) {
      return {
        result: `{"note":"Cloudflare AI not available","category":"other","confidence":0}`,
        model: config.model,
        provider: 'cloudflare',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }

    // Cloudflare vision model expects image as URL or base64
    const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

    let response: any;
    try {
      response = await this.env.AI.run(config.model as any, {
        messages: [{ role: 'user', content: textPrompt }],
        image: [...imageBytes],
        max_tokens: config.maxTokens,
      });
    } catch (aiErr) {
      console.warn('[AI Router] Cloudflare Vision AI run failed (likely --local mode):', (aiErr as Error).message);
      return {
        result: '',
        model: config.model,
        provider: 'cloudflare',
        inputTokens: 0,
        outputTokens: 0,
        cost: 0,
      };
    }

    const text = response?.response || response?.description || '';
    const inputTokens = Math.ceil(textPrompt.length / 4) + 500; // rough image token estimate
    const outputTokens = Math.ceil(text.length / 4);

    return {
      result: text,
      model: config.model,
      provider: 'cloudflare',
      inputTokens,
      outputTokens,
      cost: 0,
    };
  }

  // ── Anthropic Claude API ───────────────────────────────

  private async routeAnthropic(
    config: ModelConfig,
    input: string,
    systemPrompt: string,
  ): Promise<AIResponse> {
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
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
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
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      cost,
    };
  }

  private async routeAnthropicVision(
    config: ModelConfig,
    imageBase64: string,
    mimeType: string,
    textPrompt: string,
  ): Promise<AIResponse> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxTokens,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: imageBase64 },
            },
            { type: 'text', text: textPrompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic Vision API error (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const inputTokens = data.usage?.input_tokens || 0;
    const outputTokens = data.usage?.output_tokens || 0;
    const cost =
      inputTokens * config.costPerInputToken +
      outputTokens * config.costPerOutputToken;

    const text = data.content?.[0]?.text || '';

    return {
      result: text,
      model: config.model,
      provider: 'anthropic',
      inputTokens,
      outputTokens,
      cost,
    };
  }

  // ── Usage Logging ──────────────────────────────────────

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

  /**
   * Check which provider is active for a given task.
   */
  getActiveProvider(task: AITask): AIProvider {
    return this.getModelConfig(task).provider;
  }

  /**
   * Get a summary of provider status for diagnostics.
   */
  getProviderStatus(): { anthropic: boolean; cloudflare: boolean; defaultProvider: AIProvider } {
    return {
      anthropic: this.hasAnthropicKey,
      cloudflare: true, // Always available via Workers AI binding
      defaultProvider: this.hasAnthropicKey ? 'anthropic' : 'cloudflare',
    };
  }
}
