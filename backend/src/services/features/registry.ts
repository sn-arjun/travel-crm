/**
 * The feature registry (R127): the one list of switchable features. The super admin console shows exactly this list;
 * every key passed to requireFeature() or checked against a plan must be in it (test/feature-switches.test.ts).
 */

export interface FeatureDef {
  key: string;
  name: string;
  description: string;
  area: 'Core' | 'Communication' | 'Calling' | 'AI' | 'Platform';
}

const f = (key: string, name: string, area: FeatureDef['area'], description: string): FeatureDef => ({ key, name, description, area });

export const FEATURE_REGISTRY: readonly FeatureDef[] = [
  // Core
  f('fleet_management', 'Fleet management', 'Core', 'Vehicles, drivers and trip assignment.'),
  f('driver_app', 'Driver app', 'Core', 'The driver mobile app and its trip feed.'),
  f('visa_management', 'Visa management', 'Core', 'Visa applications and document checklists.'),
  f('supplier_management', 'Supplier management', 'Core', 'Suppliers, rate cards and supplier payments.'),
  f('advanced_reports', 'Advanced reports', 'Core', 'Profitability, forecasting and scheduled reports.'),
  // Communication
  f('bulk_sms', 'Bulk SMS', 'Communication', 'SMS campaigns to many contacts.'),
  f('bulk_whatsapp', 'Bulk WhatsApp', 'Communication', 'WhatsApp campaigns to many contacts.'),
  f('bulk_email', 'Bulk email', 'Communication', 'Email campaigns to many contacts.'),
  f('marketing_flyers', 'Marketing flyers', 'Communication', 'Flyer and creative generation.'),
  f('whatsapp_campaigns', 'WhatsApp campaigns', 'Communication', 'The WhatsApp campaigns workspace.'),
  // Calling
  f('voip_calling', 'Calling', 'Calling', 'Calls from the CRM through the agency sub-account.'),
  // Platform
  f('api_access', 'API access', 'Platform', 'Public API keys for the agency.'),
  f('custom_domain', 'Custom domain', 'Platform', 'The agency website on its own domain.'),
  f('white_label', 'White label', 'Platform', 'The agency brand instead of the platform brand.'),
  f('priority_support', 'Priority support', 'Platform', 'Faster support response.'),
  // AI surfaces checked by the desktop
  f('ai_assistant', 'AI assistant', 'AI', 'The in-app assistant.'),
  f('ai_extraction', 'AI extraction', 'AI', 'Reading enquiries, tickets and documents into records.'),
  f('ai_intelligence', 'AI intelligence', 'AI', 'Insight cards and predictions across the CRM.'),
  f('ai_chatbot', 'AI chatbot', 'AI', 'The website chatbot.'),
  // AI features (Pro tier)
  f('ai_copilot', 'AI copilot', 'AI', 'Suggestions while working on leads, bookings and calls.'),
  f('ai_call_summary', 'AI call summary', 'AI', 'Call summaries and next steps.'),
  f('ai_lead_scoring', 'AI lead scoring', 'AI', 'Lead score and reasons.'),
  f('ai_message_compose', 'AI message compose', 'AI', 'Drafting messages.'),
  f('ai_itinerary_generate', 'AI itinerary generation', 'AI', 'Draft itineraries from a brief.'),
  f('ai_cost_estimation', 'AI cost estimation', 'AI', 'Quote estimates.'),
  f('ai_ocr', 'AI document OCR', 'AI', 'Reading passports and documents.'),
  f('ai_search', 'AI search', 'AI', 'Natural language search.'),
  // AI features (Enterprise tier)
  f('ai_dialer_cards', 'AI dialer cards', 'AI', 'Pre-call context in the dialer.'),
  f('ai_vehicle_recommend', 'AI vehicle recommendation', 'AI', 'Vehicle choice for trips.'),
  f('ai_driver_recommend', 'AI driver recommendation', 'AI', 'Driver choice for trips.'),
  f('ai_expense_analysis', 'AI expense analysis', 'AI', 'Expense anomalies.'),
  f('ai_margin_insights', 'AI margin insights', 'AI', 'Margin analysis.'),
  f('ai_payment_prediction', 'AI payment prediction', 'AI', 'Late payment prediction.'),
  f('ai_visa_intelligence', 'AI visa intelligence', 'AI', 'Visa requirement guidance.'),
  f('ai_campaign_content', 'AI campaign content', 'AI', 'Campaign copy.'),
  f('ai_campaign_optimize', 'AI campaign optimisation', 'AI', 'Campaign timing and audience.'),
  f('ai_follow_up_suggest', 'AI follow-up suggestions', 'AI', 'When and how to follow up.'),
  f('ai_churn_prediction', 'AI churn prediction', 'AI', 'Customers likely to leave.'),
  f('ai_daily_briefing', 'AI daily briefing', 'AI', 'A morning summary.'),
  f('ai_supplier_negotiate', 'AI supplier negotiation', 'AI', 'Negotiation prompts.'),
  f('ai_coaching', 'AI coaching', 'AI', 'Coaching for agents.'),
];

export const FEATURE_KEYS: readonly string[] = FEATURE_REGISTRY.map((x) => x.key);

export function isRegisteredFeature(key: string): boolean {
  return FEATURE_KEYS.includes(key);
}
