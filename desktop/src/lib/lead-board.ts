/**
 * The leads pipeline board's state: columns with their leads, and the moves staff make between them.
 *
 * Pure functions and a reducer, so the optimistic move and its rollback are tested without a browser.
 * A move is applied at once; if the status route refuses it the same move is undone, leaving the board as it was.
 */

export interface BoardLead {
  id: string;
  title: string;
  status: string;
  contactName?: string | null;
  destinations?: string[];
  travelDate?: string | null;
  budget?: number | null;
  estimatedValue?: number | null;
  /** Null means the agency currency. */
  currency?: string | null;
  priority?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  /** Seats held or confirmed on a group departure; only present when the departures feature is on. */
  seats?: number;
  seatStatus?: 'held' | 'confirmed';
  [key: string]: unknown;
}

export interface BoardColumn {
  status: string;
  /** Leads in the column for the current filters, not only the ones loaded. */
  count: number;
  /** Sum in the agency currency. */
  value: number;
  currency: string;
  /** Leads in another currency: counted in `count`, not summed in `value`. */
  otherCurrencyCount: number;
  leads: BoardLead[];
  /** Pages of 20 loaded so far. */
  page: number;
}

export interface BoardState {
  columns: BoardColumn[];
  currency: string;
  showValue: boolean;
}

export const EMPTY_BOARD: BoardState = { columns: [], currency: '', showValue: true };

/** Pipeline statuses staff can pick, in order, with the dot colour of their column. */
export const STATUS_COLORS: Record<string, string> = {
  new: 'var(--ds-primary)',
  contacted: 'var(--ds-info)',
  qualified: 'var(--ds-info)',
  requirement_gathered: 'var(--ds-info)',
  proposal_sent: 'var(--ds-warning)',
  negotiation: 'var(--ds-warning)',
  won: 'var(--ds-success)',
  booking_confirmed: 'var(--ds-success)',
  completed: 'var(--ds-success)',
  lost: 'var(--ds-danger)',
  on_hold: 'var(--ds-foreground-muted)',
};

/** What the lead is worth for the column total: the estimated value when set, else the budget. */
export function leadAmount(lead: Pick<BoardLead, 'estimatedValue' | 'budget'>): number {
  const estimated = Number(lead.estimatedValue);
  if (Number.isFinite(estimated) && estimated > 0) return estimated;
  const budget = Number(lead.budget);
  return Number.isFinite(budget) && budget > 0 ? budget : 0;
}

/** A lead without a currency is in the agency currency. */
export function leadCurrency(lead: Pick<BoardLead, 'currency'>, boardCurrency: string): string {
  return lead.currency || boardCurrency;
}

export function hasMore(column: BoardColumn): boolean {
  return column.leads.length < column.count;
}

/** Turns the GET /leads/board answer into board state. */
export function boardFromResponse(res: unknown): BoardState {
  const data = (res && typeof res === 'object' ? (res as { data?: unknown }).data ?? res : {}) as {
    columns?: Array<Record<string, unknown>>;
    currency?: string;
    showValue?: boolean;
  };
  const currency = typeof data.currency === 'string' ? data.currency : '';
  const columns: BoardColumn[] = (Array.isArray(data.columns) ? data.columns : []).map((c) => ({
    status: String(c.status),
    count: Number(c.count) || 0,
    value: Number(c.value) || 0,
    currency: typeof c.currency === 'string' ? c.currency : currency,
    otherCurrencyCount: Number(c.otherCurrencyCount) || 0,
    leads: Array.isArray(c.leads) ? (c.leads as BoardLead[]) : [],
    page: 1,
  }));
  return { columns, currency, showValue: data.showValue !== false };
}

export type BoardAction =
  | { type: 'replace'; state: BoardState }
  /** The next page of one column; leads already on the board are skipped. */
  | { type: 'append'; status: string; leads: BoardLead[]; count: number }
  | { type: 'move'; leadId: string; to: string }
  /** Undoes a move: `index` is where the lead stood in `from` before it. */
  | { type: 'rollback'; leadId: string; from: string; to: string; index: number }
  | { type: 'patch'; leadId: string; changes: Partial<BoardLead> };

export interface LeadLocation {
  status: string;
  index: number;
  lead: BoardLead;
}

export function locateLead(columns: BoardColumn[], leadId: string): LeadLocation | null {
  for (const col of columns) {
    const index = col.leads.findIndex((l) => l.id === leadId);
    const lead = col.leads[index];
    if (lead) return { status: col.status, index, lead };
  }
  return null;
}

/** The column with one lead taken out, its count and value reduced. */
function without(col: BoardColumn, lead: BoardLead, boardCurrency: string): BoardColumn {
  const amount = leadAmount(lead);
  const same = leadCurrency(lead, boardCurrency) === col.currency;
  return {
    ...col,
    count: Math.max(0, col.count - 1),
    value: same ? roundMoney(Math.max(0, col.value - amount)) : col.value,
    otherCurrencyCount: same ? col.otherCurrencyCount : Math.max(0, col.otherCurrencyCount - 1),
    leads: col.leads.filter((l) => l.id !== lead.id),
  };
}

/** The column with one lead put in at `index` (the top by default), its count and value raised. */
function withLead(col: BoardColumn, lead: BoardLead, boardCurrency: string, index = 0): BoardColumn {
  const amount = leadAmount(lead);
  const same = leadCurrency(lead, boardCurrency) === col.currency;
  const leads = col.leads.slice();
  leads.splice(Math.min(Math.max(index, 0), leads.length), 0, lead);
  return {
    ...col,
    count: col.count + 1,
    value: same ? roundMoney(col.value + amount) : col.value,
    otherCurrencyCount: same ? col.otherCurrencyCount : col.otherCurrencyCount + 1,
    leads,
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function relocate(state: BoardState, leadId: string, from: string, to: string, index: number): BoardState {
  if (from === to) return state;
  const source = state.columns.find((c) => c.status === from);
  const target = state.columns.find((c) => c.status === to);
  const lead = source?.leads.find((l) => l.id === leadId);
  if (!source || !target || !lead) return state;
  const moved = { ...lead, status: to };
  return {
    ...state,
    columns: state.columns.map((c) => {
      if (c.status === from) return without(c, lead, state.currency);
      if (c.status === to) return withLead(c, moved, state.currency, index);
      return c;
    }),
  };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'replace':
      return action.state;
    case 'append':
      return {
        ...state,
        columns: state.columns.map((c) => {
          if (c.status !== action.status) return c;
          const known = new Set(c.leads.map((l) => l.id));
          const fresh = action.leads.filter((l) => !known.has(l.id) && !locateLead(state.columns, l.id));
          return { ...c, leads: [...c.leads, ...fresh], count: Math.max(action.count, c.leads.length + fresh.length), page: c.page + 1 };
        }),
      };
    case 'move': {
      const at = locateLead(state.columns, action.leadId);
      if (!at) return state;
      return relocate(state, action.leadId, at.status, action.to, 0);
    }
    case 'rollback':
      return relocate(state, action.leadId, action.to, action.from, action.index);
    case 'patch':
      return {
        ...state,
        columns: state.columns.map((c) => ({
          ...c,
          leads: c.leads.map((l) => (l.id === action.leadId ? { ...l, ...action.changes } : l)),
        })),
      };
    default:
      return state;
  }
}

/** True when the move changes the status (a drop on the card's own column does nothing). */
export function isMove(from: string, to: string): boolean {
  return from !== to;
}

/** Dropping on Lost needs a reason first. */
export function needsLostReason(to: string): boolean {
  return to === 'lost';
}

/** Dropping on Won asks for confirmation first. */
export function needsWonConfirmation(to: string): boolean {
  return to === 'won';
}

export interface ColumnValueLabel {
  /** The total in the agency currency, or '' when there is nothing to show. */
  amount: string;
  /** How many leads are in another currency and so left out of the total (0 when none). */
  otherCurrency: number;
}

/** The column's total as text, with the number of leads left out because they are in another currency. */
export function columnValueLabel(
  column: Pick<BoardColumn, 'value' | 'currency' | 'otherCurrencyCount'>,
  format: (amount: number, currency: string) => string,
): ColumnValueLabel {
  return {
    amount: column.value > 0 ? format(column.value, column.currency) : '',
    otherCurrency: column.otherCurrencyCount,
  };
}

export interface BoardFilters {
  search?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  unassigned?: boolean;
}

/** Query parameters of GET /leads/board; empty filters are left out. */
export function boardParams(filters: BoardFilters, extra: { status?: string; page?: number } = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (filters.search) out.search = filters.search;
  if (filters.priority) out.priority = filters.priority;
  if (filters.unassigned) out.unassigned = '1';
  else if (filters.assignedTo) out.assignedTo = filters.assignedTo;
  const status = extra.status ?? filters.status;
  if (status) out.status = status;
  if (extra.page && extra.page > 1) out.page = extra.page;
  return out;
}

/** localStorage key of the List / Board choice, one per user. */
export function viewStorageKey(userId?: string | null): string {
  return `leads.view.${userId || 'anon'}`;
}

export type LeadsView = 'list' | 'board';

export function parseView(raw: string | null | undefined): LeadsView {
  return raw === 'board' ? 'board' : 'list';
}
