/**
 * AI price list and credit classes.
 *
 * Provider list prices in USD per million tokens (Cloudflare Workers AI pricing page and
 * Anthropic pricing, read 2026-10-08). Workers AI is billed per neuron beyond a small
 * account-wide daily allowance, so it is never recorded as free.
 */

import type { AITask } from './ai-router';

export interface ModelPrice {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { inputPerMTok: 0.293, outputPerMTok: 2.253 },
  '@cf/meta/llama-3.1-70b-instruct-fp8-fast': { inputPerMTok: 0.293, outputPerMTok: 2.253 },
  // Not on the current price list; costed at the 70B fp8-fast rate until it is replaced.
  '@cf/meta/llama-3.1-70b-instruct': { inputPerMTok: 0.293, outputPerMTok: 2.253 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { inputPerMTok: 0.045, outputPerMTok: 0.384 },
  '@cf/google/gemma-4-26b-a4b-it': { inputPerMTok: 0.1, outputPerMTok: 0.3 },
  '@cf/meta/llama-3.2-11b-vision-instruct': { inputPerMTok: 0.049, outputPerMTok: 0.676 },
  '@cf/ai4bharat/indictrans2-en-indic-1B': { inputPerMTok: 0.342, outputPerMTok: 0.342 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-haiku-4-5-20251001': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
};

// A model missing from the list is costed at the most expensive rate so it is never under-reported.
const UNKNOWN_MODEL_PRICE: ModelPrice = { inputPerMTok: 4, outputPerMTok: 20 };

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? UNKNOWN_MODEL_PRICE;
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
}

// ── Credits ────────────────────────────────────────────────────
// Tenants are metered in credits, sized so one credit is about the same provider cost in every class.

export type AiCreditClass = 'read' | 'understand' | 'scan' | 'create';

export const CREDIT_WEIGHTS: Record<AiCreditClass, number> = {
  read: 1, // label a message, sentiment, translation
  understand: 5, // extraction, drafted reply, call summary
  scan: 15, // passport, payment proof, business card
  create: 60, // itinerary, briefing, plain-English query
};

const READ_TASKS: ReadonlySet<AITask> = new Set<AITask>([
  'sentiment', 'followup_timing', 'followup_channel', 'escalation_detection', 'message_triage',
]);

const SCAN_TASKS: ReadonlySet<AITask> = new Set<AITask>([
  'business_card_ocr', 'passport_ocr', 'visa_classification', 'supplier_invoice_ocr',
]);

const CREATE_TASKS: ReadonlySet<AITask> = new Set<AITask>([
  'itinerary', 'itinerary_generation', 'itinerary_enrichment',
  'invoice', 'invoice_generation',
  'daily_briefing', 'weekly_briefing', 'monthly_briefing',
  'nl_query', 'conversational_analytics', 'customer_insight', 'customer_ltv',
  'business_health_score', 'ai_recommendation_gen',
]);

export function creditClassFor(task: AITask): AiCreditClass {
  if (SCAN_TASKS.has(task)) return 'scan';
  if (CREATE_TASKS.has(task)) return 'create';
  if (READ_TASKS.has(task)) return 'read';
  return 'understand';
}

export const AI_CREDITS_CAP_KEY = 'ai_credits_per_month';

/** Monthly credit allowance included in each plan. */
export const PLAN_AI_CREDITS: Record<string, number> = {
  trial: 2000,
  starter: 1000,
  basic: 1000,
  pro: 15000,
  enterprise: 25000,
};

export const DEFAULT_PLAN_AI_CREDITS = 1000;
