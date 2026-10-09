import type { z } from 'zod';
import type { Env } from '../../types';
import type { Module, Permission } from '../../constants/permissions';

export type AutomationMode = 'off' | 'suggest' | 'auto';
export type Risk = 'low' | 'medium' | 'high';

/** Something that happened in the workspace. Every automation starts from one. */
export interface DomainEvent {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  actorId: string | null;
  /** 0 for a person or a public channel; +1 for every automation in the chain that caused it. */
  depth: number;
}

export interface ApiResult {
  ok: boolean;
  status: number;
  // The API's `data` envelope content; shape depends on the endpoint.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error?: string;
}

/** Calls this app's own API as a specific user. */
export type ApiCaller = (method: string, path: string, body?: unknown) => Promise<ApiResult>;

export interface ActionContext {
  env: Env;
  tenantId: string;
  db: D1Database;
  api: ApiCaller;
  /** The person who clicked, or the admin an automatic run acts for. */
  actorId: string | null;
  /** True when the action runs without a click. */
  automatic: boolean;
  depth: number;
}

export interface ActionEntity {
  type: string;
  id: string;
  label?: string;
}

export interface ActionResult {
  entities: ActionEntity[];
  /** Whatever `undo` needs to reverse this run. */
  undo?: Record<string, unknown>;
  summary?: string;
}

export interface ActionDefinition {
  type: string;
  label: string;
  /** Permission a person needs to apply it. */
  module: Module;
  permission: Permission;
  /** Only `low` may ever run without a click. */
  risk: Risk;
  /** The client performs it (e.g. opens the send dialog); the server only records the outcome. */
  clientHandled?: boolean;
  schema: z.ZodTypeAny;
  // Params are validated by `schema` before every call.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute(ctx: ActionContext, params: any): Promise<ActionResult>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  undo?(ctx: ActionContext, undo: any): Promise<void>;
}

/** What a recipe wants done. Becomes a suggestion, or runs straight away in `auto` mode. */
export interface Proposal {
  action: string;
  params: Record<string, unknown>;
  title: string;
  reason: string;
  /** Where the suggestion is shown. */
  entityType: string;
  entityId: string;
  contactId?: string | null;
  leadId?: string | null;
  /** One suggestion per key; a second proposal with the same key is merged or ignored. */
  dedupeKey: string;
  /** Merge params into a still-pending suggestion with the same key (bursts of messages). */
  mergeIntoPending?: boolean;
  confidence?: number;
  assignedTo?: string | null;
  origin?: 'rule' | 'ai';
  sourceType?: string;
  sourceId?: string;
  model?: string;
}

export interface RecipeSetting {
  key: string;
  label: string;
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  unit?: string;
}

export interface RecipeContext {
  env: Env;
  tenantId: string;
  db: D1Database;
  settings: Record<string, number>;
  /** Whether this workspace's plan includes AI understanding of messages. */
  aiAllowed: boolean;
}

export interface Recipe {
  key: string;
  area: string;
  title: string;
  description: string;
  triggers: string[];
  defaultMode: AutomationMode;
  /** Whether `auto` is offered at all (the action must also be low risk). */
  autoEligible: boolean;
  usesAi?: boolean;
  /** Plan feature required; the recipe is listed but locked without it. */
  featureKey?: string;
  settings?: RecipeSetting[];
  evaluate(ctx: RecipeContext, event: DomainEvent): Promise<Proposal[]>;
}
