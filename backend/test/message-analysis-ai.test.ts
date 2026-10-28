import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { analyzeMessage } from '../src/services/automation/message-analysis';
import { getCreditBalance } from '../src/services/ai-credits';
import { CREDIT_WEIGHTS } from '../src/services/ai-pricing';

const testEnv = env as any;
const TENANT = 'analysis-tenant';

const INPUT = {
  text: 'Hi, this is Meera. Family of four planning 5 nights in Kerala from 18 Dec, budget 1.3 lakh. Paid nothing yet.',
  channel: 'whatsapp',
  senderName: 'Meera Pillai',
  companyName: 'Sahyadri Holidays',
  knownDestinations: ['Kerala', 'Munnar'],
  today: '2026-10-08',
};

/** A Workers AI stand-in: answers by model, never spends anything. */
function fakeAi(answers: { triage: unknown; understand?: unknown }) {
  const calls: string[] = [];
  return {
    calls,
    run: async (model: string) => {
      calls.push(model);
      const isTriage = model.includes('8b');
      return { response: isTriage ? answers.triage : answers.understand, usage: { prompt_tokens: 300, completion_tokens: 40 } };
    },
  };
}

function envWith(ai: unknown) {
  return { ...testEnv, ANTHROPIC_API_KEY: '', AI: ai } as any;
}

const UNDERSTOOD = {
  name: 'Meera',
  destinations: ['Munnar', 'Alleppey'],
  travelDate: '2026-12-18',
  returnDate: null,
  nights: 5,
  paxAdults: 2,
  paxChildren: 2,
  budget: 130000,
  tripType: 'family',
  specialRequirements: null,
  paymentAmount: null,
  paymentReference: 'UTR999INVENTED',
  summary: 'Family of four wants five nights in Kerala from 18 December.',
  draftReply: 'Hi Meera, thank you for your enquiry. We will share a plan shortly.\n\nSahyadri Holidays',
};

describe('Message understanding with AI', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    await testEnv.MASTER_DB.batch([
      testEnv.MASTER_DB.prepare('DELETE FROM tenant_usage_caps WHERE tenant_id = ?').bind(TENANT),
      testEnv.MASTER_DB.prepare(
        `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'Analysis Co', 'analysis-co', 'pro', 'active')`,
      ).bind(TENANT),
    ]);
  });

  it('accepts JSON the model returns already parsed as an object, and as text', async () => {
    // The small model hands back an object; the larger one a string, here with prose around it.
    const ai = fakeAi({
      triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true },
      understand: `Here is the result:\n${JSON.stringify(UNDERSTOOD)}`,
    });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });

    expect(a.source).toBe('ai');
    expect(ai.calls).toHaveLength(2);
    expect(a.intent).toBe('enquiry');
    expect(a.entities).toMatchObject({ name: 'Meera', nights: 5, paxAdults: 2, paxChildren: 2, budget: 130000, travelDate: '2026-12-18' });
    // The model's places come first; what only the rules spotted is added.
    expect(a.entities.destinations).toEqual(['Munnar', 'Alleppey', 'Kerala']);
    // A return date the model left out is worked out from the nights.
    expect(a.entities.returnDate).toBe('2026-12-23');
    expect(a.draftReply).toContain('Hi Meera');
    expect(a.cost).toBeGreaterThan(0);
  });

  it('drops the placeholders a model writes for what it does not know', async () => {
    const ai = fakeAi({
      triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true },
      understand: { ...UNDERSTOOD, name: 'null', tripType: 'N/A', specialRequirements: '', budget: 0, travelDate: '2023-12-18', paymentReference: 'none' },
    });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(a.entities.name).toBeUndefined();
    expect(a.entities.specialRequirements).toBeUndefined();
    // The rules read "family" and "1.3 lakh" from the text, so those survive the model's blanks.
    expect(a.entities.tripType).toBe('family');
    expect(a.entities.budget).toBe(130000);
    // A date in the past is a misread year; the date the rules read from "18 Dec" stands.
    expect(a.entities.travelDate).toBe('2026-12-18');
  });

  it('keeps the exact numbers the rules read, and adults and children from one source', async () => {
    const text = 'Family of four (kids aged 6 and 9), 5 nights in Kerala from 18 Dec, budget 1.3 lakh';
    const ai = fakeAi({
      triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true },
      understand: { ...UNDERSTOOD, paxAdults: 4, paxChildren: 2, budget: 13000, nights: 6 },
    });
    const a = await analyzeMessage(envWith(ai), TENANT, { ...INPUT, text }, { aiAllowed: true });
    expect(a.entities).toMatchObject({ paxAdults: 2, paxChildren: 2, budget: 130000, nights: 5 });
  });

  it('does not trust a bank reference that is not in the message', async () => {
    const ai = fakeAi({ triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true }, understand: UNDERSTOOD });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(a.entities.paymentReference).toBeUndefined();
  });

  it('charges one read and one understand, and only reads small talk', async () => {
    const working = fakeAi({ triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true }, understand: UNDERSTOOD });
    await analyzeMessage(envWith(working), TENANT, INPUT, { aiAllowed: true });
    expect((await getCreditBalance(testEnv.MASTER_DB, TENANT)).used).toBe(CREDIT_WEIGHTS.read + CREDIT_WEIGHTS.understand);

    const smallTalk = fakeAi({ triage: { intent: 'other', urgency: 'low', language: 'en', needsWork: false } });
    const a = await analyzeMessage(envWith(smallTalk), TENANT, { ...INPUT, text: 'Thanks a lot!' }, { aiAllowed: true });
    expect(a).toMatchObject({ source: 'ai', needsWork: false, intent: 'other' });
    expect(smallTalk.calls).toHaveLength(1);
    expect((await getCreditBalance(testEnv.MASTER_DB, TENANT)).used).toBe(CREDIT_WEIGHTS.read * 2 + CREDIT_WEIGHTS.understand);
  });

  it('goes on to understand an enquiry even when the small model says no work is needed', async () => {
    const ai = fakeAi({ triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: false }, understand: UNDERSTOOD });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(ai.calls).toHaveLength(2);
    expect(a).toMatchObject({ source: 'ai', needsWork: true, intent: 'enquiry' });
  });

  it('does not let the model wave away a message the rules recognise', async () => {
    const ai = fakeAi({ triage: { intent: 'other', urgency: 'low', language: 'en', needsWork: false }, understand: UNDERSTOOD });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(ai.calls).toHaveLength(2);
    expect(a).toMatchObject({ needsWork: true, intent: 'enquiry' });
  });

  it('falls back to the rules when the model answers nonsense', async () => {
    const ai = fakeAi({ triage: 'I cannot help with that.' });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(a.source).toBe('rules');
    expect(a.intent).toBe('enquiry');
    expect(a.entities.destinations).toEqual(['Kerala']);
  });

  it('uses only the rules when the plan has no AI, without calling the model', async () => {
    const ai = fakeAi({ triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true }, understand: UNDERSTOOD });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: false });
    expect(a.source).toBe('rules');
    expect(ai.calls).toHaveLength(0);
  });

  it('uses only the rules once the month\'s credits are gone', async () => {
    await testEnv.MASTER_DB.prepare(
      `INSERT OR REPLACE INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period) VALUES ('analysis-cap', ?, 'ai_credits_per_month', 10, 1000000, 'monthly')`,
    ).bind(TENANT).run();
    const ai = fakeAi({ triage: { intent: 'enquiry', urgency: 'normal', language: 'en', needsWork: true }, understand: UNDERSTOOD });
    const a = await analyzeMessage(envWith(ai), TENANT, INPUT, { aiAllowed: true });
    expect(a.source).toBe('rules');
    expect(ai.calls).toHaveLength(0);
  });
});
