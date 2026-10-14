/**
 * AI Model Router — TICKET-411
 *
 * Routes AI tasks to the appropriate provider:
 *   1. Cloudflare Workers AI (default, free/included with Workers plan)
 *   2. Anthropic Claude API (when ANTHROPIC_API_KEY is set in env)
 *
 * Tracks token usage and cost per call (price list: ai-pricing.ts) and, when built with a
 * tenant id, meters the tenant's monthly AI credits (ai-credits.ts).
 */

import type { Env } from '../types';
import { generateId } from '../utils/uuid';
import { creditClassFor, estimateCostUsd, priceFor } from './ai-pricing';
import { assertCredits, chargeCredits } from './ai-credits';

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
  | 'marketing_suggestion' | 'whatsapp_campaign_template'
  | 'message_triage' | 'message_understand';

export type AIProvider = 'cloudflare' | 'anthropic';

export const AI_UNAVAILABLE_CODE = 'AI_UNAVAILABLE';
export const AI_UNAVAILABLE_MESSAGE = 'AI is not configured for this workspace yet.';

/**
 * Thrown when no AI provider can serve a request (no Workers AI binding / binding not functional,
 * and no Anthropic key). Routes translate it into HTTP 503 with code AI_UNAVAILABLE. It is thrown
 * BEFORE any usage/quota counter is incremented, and stub text is never returned as content.
 */
export class AiUnavailableError extends Error {
  readonly code = AI_UNAVAILABLE_CODE;
  constructor(message: string = AI_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

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
// Small, cheap model that labels every received message (stage 1 of the assistant).
const CF_TRIAGE_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';
// Extraction into a fixed shape: a model that supports Workers AI JSON mode, so the reply is always valid JSON.
const CF_JSON_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Anthropic models
const CLAUDE_HAIKU = 'claude-haiku-4-5-20251001';

function modelConfig(provider: AIProvider, model: string, maxTokens: number): ModelConfig {
  const price = priceFor(model);
  return {
    provider,
    model,
    maxTokens,
    costPerInputToken: price.inputPerMTok / 1_000_000,
    costPerOutputToken: price.outputPerMTok / 1_000_000,
  };
}

const CF_CONFIG = modelConfig('cloudflare', CF_TEXT_MODEL, 2048);
const CF_VISION_CONFIG = modelConfig('cloudflare', CF_VISION_MODEL, 1024);
const CF_TRIAGE_CONFIG = modelConfig('cloudflare', CF_TRIAGE_MODEL, 256);
const CF_JSON_CONFIG = modelConfig('cloudflare', CF_JSON_MODEL, 1024);
const CLAUDE_CONFIG = modelConfig('anthropic', CLAUDE_HAIKU, 2048);
const CLAUDE_VISION_CONFIG = modelConfig('anthropic', CLAUDE_HAIKU, 1024);

// Tasks that benefit from larger context / better reasoning — use Claude when available
const PREFER_CLAUDE_TASKS: Set<AITask> = new Set([
  'itinerary', 'itinerary_generation', 'itinerary_enrichment',
  'invoice', 'invoice_generation',
  'daily_briefing', 'weekly_briefing', 'monthly_briefing',
  'nl_query', 'customer_insight', 'customer_ltv',
  'business_health_score', 'ai_recommendation_gen',
]);

/** Workers AI hands back JSON output already parsed for some models; callers always get text. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

export class AIRouter {
  private env: Env;
  private hasAnthropicKey: boolean;
  private tenantOverrides?: Partial<Record<AITask, Partial<ModelConfig>>>;
  private tenantId?: string;

  /**
   * @param tenantId when given, every call checks and then charges the tenant's AI credits.
   */
  constructor(
    env: Env,
    tenantOverrides?: Partial<Record<AITask, Partial<ModelConfig>>>,
    tenantId?: string,
  ) {
    this.env = env;
    this.hasAnthropicKey = !!env.ANTHROPIC_API_KEY;
    this.tenantOverrides = tenantOverrides;
    this.tenantId = tenantId;
  }

  /** Check credits, run the call, charge on success. A failed call costs the tenant nothing. */
  private async metered(task: AITask, call: () => Promise<AIResponse>): Promise<AIResponse> {
    if (!this.tenantId) return call();
    const creditClass = creditClassFor(task);
    await assertCredits(this.env, this.tenantId, creditClass);
    const response = await call();
    await chargeCredits(this.env, this.tenantId, creditClass);
    return response;
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
    // Triage runs on every message, so it stays on the small model whatever else is configured.
    if (task === 'message_triage') return CF_TRIAGE_CONFIG;
    if (task === 'message_understand') return CF_JSON_CONFIG;

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
    /** `jsonSchema`: ask the provider to return JSON matching this schema (Workers AI JSON mode). */
    options: { jsonSchema?: Record<string, unknown> } = {},
  ): Promise<AIResponse> {
    const config = this.getModelConfig(task);

    return this.metered(task, () =>
      config.provider === 'anthropic'
        ? this.routeAnthropic(config, input, systemPrompt)
        : this.routeCloudflare(config, input, systemPrompt, options.jsonSchema),
    );
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

    return this.metered(task, () =>
      config.provider === 'anthropic'
        ? this.routeAnthropicVision(config, imageBase64, mimeType, textPrompt)
        : this.routeCloudflareVision(config, imageBase64, textPrompt),
    );
  }

  // ── Cloudflare Workers AI ──────────────────────────────

  private async routeCloudflare(
    config: ModelConfig,
    input: string,
    systemPrompt: string,
    jsonSchema?: Record<string, unknown>,
  ): Promise<AIResponse> {
    // No Workers AI binding (e.g. local dev / e2e config): there is no provider to answer.
    if (!this.env.AI) {
      throw new AiUnavailableError();
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
        ...(jsonSchema ? { response_format: { type: 'json_schema', json_schema: jsonSchema } } : {}),
      });
    } catch (aiErr) {
      // AI binding is present but not functional (e.g. local dev stub with --local flag)
      console.warn('[AI Router] Cloudflare AI run failed:', (aiErr as Error).message);
      throw new AiUnavailableError();
    }

    const text = asText(response?.response ?? response?.result);
    // Use the reported token counts; older models omit them, so fall back to a length estimate.
    const inputTokens = response?.usage?.prompt_tokens ?? Math.ceil((systemPrompt.length + input.length) / 4);
    const outputTokens = response?.usage?.completion_tokens ?? Math.ceil(text.length / 4);

    return {
      result: text,
      model: config.model,
      provider: 'cloudflare',
      inputTokens,
      outputTokens,
      cost: estimateCostUsd(config.model, inputTokens, outputTokens),
    };
  }

  private async routeCloudflareVision(
    config: ModelConfig,
    imageBase64: string,
    textPrompt: string,
  ): Promise<AIResponse> {
    if (!this.env.AI) {
      throw new AiUnavailableError();
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
      console.warn('[AI Router] Cloudflare Vision AI run failed:', (aiErr as Error).message);
      throw new AiUnavailableError();
    }

    const text = asText(response?.response ?? response?.description);
    const inputTokens = response?.usage?.prompt_tokens ?? Math.ceil(textPrompt.length / 4) + 500; // rough image token estimate
    const outputTokens = response?.usage?.completion_tokens ?? Math.ceil(text.length / 4);

    return {
      result: text,
      model: config.model,
      provider: 'cloudflare',
      inputTokens,
      outputTokens,
      cost: estimateCostUsd(config.model, inputTokens, outputTokens),
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
    const cost = estimateCostUsd(config.model, inputTokens, outputTokens);

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
    const cost = estimateCostUsd(config.model, inputTokens, outputTokens);

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
  getProviderStatus(): { anthropic: boolean; cloudflare: boolean; available: boolean; defaultProvider: AIProvider } {
    const cloudflare = !!this.env.AI;
    return {
      anthropic: this.hasAnthropicKey,
      cloudflare,
      available: this.hasAnthropicKey || cloudflare,
      defaultProvider: this.hasAnthropicKey ? 'anthropic' : 'cloudflare',
    };
  }
}
