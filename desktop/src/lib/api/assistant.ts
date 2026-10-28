import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';

export type SuggestionStatus = 'pending' | 'applying' | 'applied' | 'auto_applied' | 'dismissed' | 'undone';

export interface SuggestionEntity {
  type: string;
  id: string;
  label?: string;
}

/** Something the assistant proposes, or has already done, about a record. */
export interface Suggestion {
  id: string;
  ruleKey: string;
  ruleTitle: string;
  origin: 'rule' | 'ai';
  entityType: string;
  entityId: string;
  contactId: string | null;
  leadId: string | null;
  sourceType: string | null;
  sourceId: string | null;
  action: {
    type: string;
    label: string;
    risk: 'low' | 'medium' | 'high';
    /** The desktop performs it (opens the send dialog); the server only records the outcome. */
    clientHandled: boolean;
  };
  params: Record<string, unknown>;
  title: string;
  reason: string | null;
  confidence: number | null;
  status: SuggestionStatus;
  result: { entities: SuggestionEntity[]; summary: string | null } | null;
  error: string | null;
  canApply: boolean;
  canUndo: boolean;
  assignedTo: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

export interface SuggestionFilter {
  leadId?: string;
  contactId?: string;
  entityType?: string;
  entityId?: string;
  sourceId?: string;
  status?: 'pending' | 'done' | 'all';
  limit?: number;
}

export interface AutomationActivity {
  id: string;
  ruleKey: string;
  ruleTitle: string;
  eventType: string | null;
  outcome: 'suggested' | 'applied' | 'failed' | 'undone' | string;
  detail: string | null;
  suggestionId: string | null;
  suggestionStatus: SuggestionStatus | null;
  entityType: string | null;
  entityId: string | null;
  leadId: string | null;
  contactId: string | null;
  canUndo: boolean;
  createdAt: string;
}

export type AutomationMode = 'off' | 'suggest' | 'auto';

export interface AutomationSetting {
  key: string;
  label: string;
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  unit?: string;
  value: number;
}

export interface AutomationRecipe {
  key: string;
  area: string;
  title: string;
  description: string;
  mode: AutomationMode;
  defaultMode: AutomationMode;
  /** Whether "Automatic" is offered at all. */
  autoEligible: boolean;
  usesAi: boolean;
  /** Not included in the workspace's plan. */
  locked: boolean;
  settings: AutomationSetting[];
  last30Days: { suggested: number; applied: number; failed: number };
}

export type RuleOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

export interface RuleCondition {
  field: string;
  op: RuleOperator;
  value: string;
}

export type RuleAction =
  | { type: 'create_task'; title: string; dueInDays: number; priority: 'low' | 'medium' | 'high' }
  | { type: 'create_follow_up'; inDays: number; followUpType: 'call' | 'email' | 'whatsapp' | 'visit' | 'sms'; notes?: string }
  | { type: 'draft_message'; channel: 'whatsapp' | 'email' | 'sms'; body: string }
  | { type: 'advance_lead_status'; status: 'contacted' | 'qualified' | 'proposal_sent' };

/** A rule the workspace built itself: when this happens, if these hold, do these. */
export interface CustomRuleInput {
  name: string;
  trigger: string;
  conditions: RuleCondition[];
  actions: RuleAction[];
  mode: AutomationMode;
}

export interface CustomRule extends CustomRuleInput {
  id: string;
  key: string;
  /** One sentence, written by the server. */
  description: string;
  autoEligible: boolean;
  last30Days: { suggested: number; applied: number; failed: number };
}

/** The fixed lists a rule is built from. */
export interface RuleBuilderOptions {
  triggers: Array<{ value: string; label: string }>;
  fields: Array<{ value: string; label: string; kind: 'text' | 'number'; options?: string[]; triggers?: string[] }>;
  operators: Array<{ value: RuleOperator; label: string; kinds: Array<'text' | 'number'> }>;
  placeholders: string[];
  maxRules: number;
}

export interface AutomationLibrary {
  plan: string;
  /** Every automation is paused for the workspace (bulk imports, migrations). */
  paused: boolean;
  aiIncluded: boolean;
  recipes: AutomationRecipe[];
  customRules: CustomRule[];
  builder: RuleBuilderOptions;
}

function query(filter: SuggestionFilter): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null && value !== '') params[key] = value as string | number;
  }
  return params;
}

export const assistantApi = {
  listSuggestions: (filter: SuggestionFilter = {}) =>
    client.get<ApiResponse<Suggestion[]>>(API_ENDPOINTS.assistant.suggestions, { params: query(filter) }),

  pendingCount: () =>
    client.get<ApiResponse<{ pending: number }>>(API_ENDPOINTS.assistant.count),

  apply: (id: string, params?: Record<string, unknown>) =>
    client.post<ApiResponse<Suggestion>>(API_ENDPOINTS.assistant.apply(id), params ? { params } : {}),

  dismiss: (id: string) =>
    client.post<ApiResponse<Suggestion>>(API_ENDPOINTS.assistant.dismiss(id), {}),

  undo: (id: string) =>
    client.post<ApiResponse<Suggestion>>(API_ENDPOINTS.assistant.undo(id), {}),

  analyze: (messageId: string) =>
    client.post<ApiResponse<{ messageId: string; intent: string | null; source: string | null }>>(API_ENDPOINTS.assistant.analyze, { messageId }),

  activity: (limit = 50) =>
    client.get<ApiResponse<AutomationActivity[]>>(API_ENDPOINTS.assistant.activity, { params: { limit } }),
};

export const automationsApi = {
  library: () =>
    client.get<ApiResponse<AutomationLibrary>>(API_ENDPOINTS.automations.list),

  update: (key: string, data: { mode?: AutomationMode; settings?: Record<string, number> }) =>
    client.put<ApiResponse<{ key: string; mode: AutomationMode; settings: Record<string, number> }>>(API_ENDPOINTS.automations.byKey(key), data),

  setPaused: (paused: boolean) =>
    client.put<ApiResponse<{ paused: boolean }>>(API_ENDPOINTS.automations.pause, { paused }),

  createRule: (rule: CustomRuleInput) =>
    client.post<ApiResponse<{ id: string; key: string; description: string }>>(API_ENDPOINTS.automations.custom, rule),

  updateRule: (id: string, rule: CustomRuleInput) =>
    client.put<ApiResponse<{ id: string; key: string; description: string }>>(API_ENDPOINTS.automations.customById(id), rule),

  deleteRule: (id: string) =>
    client.delete<ApiResponse<{ deleted: boolean }>>(API_ENDPOINTS.automations.customById(id)),

  runScheduled: () =>
    client.post<ApiResponse<{ ran: boolean }>>(API_ENDPOINTS.automations.runScheduled, {}),
};
