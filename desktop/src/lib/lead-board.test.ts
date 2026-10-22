import { describe, expect, it } from 'vitest';

import {
  boardFromResponse, boardParams, boardReducer, columnValueLabel, failureReason, hasMore, isMove, leadAmount, locateLead, needsLostReason,
  needsWonConfirmation, parseView, viewStorageKey, type BoardLead, type BoardState,
} from './lead-board';

const lead = (id: string, status: string, over: Partial<BoardLead> = {}): BoardLead => ({ id, title: `Lead ${id}`, status, ...over });

function state(): BoardState {
  return {
    currency: 'GBP',
    showValue: true,
    columns: [
      { status: 'new', count: 3, value: 1500, currency: 'GBP', otherCurrencyCount: 1, page: 1, leads: [lead('a', 'new', { budget: 1000 }), lead('b', 'new', { budget: 500, currency: 'GBP' }), lead('x', 'new', { budget: 900, currency: 'EUR' })] },
      { status: 'contacted', count: 1, value: 200, currency: 'GBP', otherCurrencyCount: 0, page: 1, leads: [lead('c', 'contacted', { estimatedValue: 200, budget: 50 })] },
      { status: 'lost', count: 0, value: 0, currency: 'GBP', otherCurrencyCount: 0, page: 1, leads: [] },
    ],
  };
}
const col = (s: BoardState, status: string) => s.columns.find((c) => c.status === status)!;

describe('leadAmount', () => {
  it('prefers the estimated value over the budget and ignores missing numbers', () => {
    expect(leadAmount({ estimatedValue: 200, budget: 50 })).toBe(200);
    expect(leadAmount({ estimatedValue: 0, budget: 50 })).toBe(50);
    expect(leadAmount({ estimatedValue: null, budget: null })).toBe(0);
    expect(leadAmount({})).toBe(0);
  });
});

describe('boardReducer move', () => {
  it('puts the lead at the top of the target and moves its count and value', () => {
    const next = boardReducer(state(), { type: 'move', leadId: 'a', to: 'contacted' });
    expect(col(next, 'new')).toMatchObject({ count: 2, value: 500 });
    expect(col(next, 'new').leads.map((l) => l.id)).toEqual(['b', 'x']);
    expect(col(next, 'contacted')).toMatchObject({ count: 2, value: 1200 });
    expect(col(next, 'contacted').leads.map((l) => [l.id, l.status])).toEqual([['a', 'contacted'], ['c', 'contacted']]);
  });

  it('moves a lead in another currency without touching the sums, only the other-currency count', () => {
    const next = boardReducer(state(), { type: 'move', leadId: 'x', to: 'contacted' });
    expect(col(next, 'new')).toMatchObject({ count: 2, value: 1500, otherCurrencyCount: 0 });
    expect(col(next, 'contacted')).toMatchObject({ count: 2, value: 200, otherCurrencyCount: 1 });
  });

  it('does not change anything for the same column or an unknown lead or column', () => {
    const s = state();
    expect(boardReducer(s, { type: 'move', leadId: 'a', to: 'new' })).toBe(s);
    expect(boardReducer(s, { type: 'move', leadId: 'nope', to: 'lost' })).toBe(s);
    expect(boardReducer(s, { type: 'move', leadId: 'a', to: 'on_hold' })).toBe(s);
  });

  it('does not mutate the previous state', () => {
    const s = state();
    const before = JSON.stringify(s);
    boardReducer(s, { type: 'move', leadId: 'a', to: 'lost' });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('boardReducer rollback', () => {
  it('puts the lead back at its place with the counts and values it had', () => {
    const s = state();
    const at = locateLead(s.columns, 'b')!;
    expect(at).toMatchObject({ status: 'new', index: 1 });
    const moved = boardReducer(s, { type: 'move', leadId: 'b', to: 'lost' });
    expect(col(moved, 'lost')).toMatchObject({ count: 1, value: 500 });
    const back = boardReducer(moved, { type: 'rollback', leadId: 'b', from: at.status, to: 'lost', index: at.index });
    expect(back).toEqual(s);
  });

  it('restores a lead in another currency too', () => {
    const s = state();
    const at = locateLead(s.columns, 'x')!;
    const back = boardReducer(boardReducer(s, { type: 'move', leadId: 'x', to: 'lost' }), { type: 'rollback', leadId: 'x', from: 'new', to: 'lost', index: at.index });
    expect(back).toEqual(s);
  });
});

describe('boardReducer append and patch', () => {
  it('adds the next page, skips leads already on the board and counts the page', () => {
    const next = boardReducer(state(), { type: 'append', status: 'new', leads: [lead('b', 'new'), lead('d', 'new')], count: 4 });
    expect(col(next, 'new').leads.map((l) => l.id)).toEqual(['a', 'b', 'x', 'd']);
    expect(col(next, 'new')).toMatchObject({ count: 4, page: 2 });
    expect(hasMore(col(next, 'new'))).toBe(false);
    expect(hasMore(col(state(), 'new'))).toBe(false);
    expect(hasMore({ ...col(state(), 'new'), count: 40 })).toBe(true);
  });

  it('skips a lead that sits in another column after a move', () => {
    const moved = boardReducer(state(), { type: 'move', leadId: 'a', to: 'contacted' });
    const next = boardReducer(moved, { type: 'append', status: 'new', leads: [lead('a', 'new')], count: 2 });
    expect(col(next, 'new').leads.map((l) => l.id)).toEqual(['b', 'x']);
  });

  it('changes fields of one lead wherever it is', () => {
    const next = boardReducer(state(), { type: 'patch', leadId: 'c', changes: { assignedToName: 'Sam' } });
    expect(col(next, 'contacted').leads[0]?.assignedToName).toBe('Sam');
    expect(col(next, 'new').leads[0]?.assignedToName).toBeUndefined();
  });
});

describe('boardFromResponse', () => {
  it('reads the API answer, and survives a bad one', () => {
    const s = boardFromResponse({
      data: {
        currency: 'EUR', showValue: false,
        columns: [{ status: 'new', count: 2, value: 10.5, currency: 'EUR', otherCurrencyCount: 1, leads: [{ id: 'a' }] }],
      },
    });
    expect(s).toMatchObject({ currency: 'EUR', showValue: false });
    expect(s.columns[0]).toMatchObject({ status: 'new', count: 2, value: 10.5, otherCurrencyCount: 1, page: 1 });
    expect(boardFromResponse(null).columns).toEqual([]);
    expect(boardFromResponse({ data: { columns: 'x' } }).columns).toEqual([]);
  });
});

describe('columnValueLabel', () => {
  const fmt = (n: number, c: string) => `${c} ${n}`;
  it('formats the total in the agency currency and reports the leads left out', () => {
    expect(columnValueLabel({ value: 1900, currency: 'GBP', otherCurrencyCount: 2 }, fmt)).toEqual({ amount: 'GBP 1900', otherCurrency: 2 });
  });
  it('shows nothing for an empty total', () => {
    expect(columnValueLabel({ value: 0, currency: 'GBP', otherCurrencyCount: 0 }, fmt)).toEqual({ amount: '', otherCurrency: 0 });
  });
});

describe('move rules and params', () => {
  it('knows which drops need a reason or a confirmation', () => {
    expect(needsLostReason('lost')).toBe(true);
    expect(needsLostReason('won')).toBe(false);
    expect(needsWonConfirmation('won')).toBe(true);
    expect(needsWonConfirmation('contacted')).toBe(false);
    expect(isMove('new', 'new')).toBe(false);
    expect(isMove('new', 'won')).toBe(true);
  });

  it('builds the query without empty filters, and one column for load more', () => {
    expect(boardParams({})).toEqual({});
    expect(boardParams({ search: 'goa', priority: 'hot', assignedTo: 'u1', status: 'new' })).toEqual({ search: 'goa', priority: 'hot', assignedTo: 'u1', status: 'new' });
    expect(boardParams({ priority: 'hot', status: 'new' }, { status: 'won', page: 3 })).toEqual({ priority: 'hot', status: 'won', page: 3 });
    expect(boardParams({ assignedTo: 'u1', unassigned: true })).toEqual({ unassigned: '1' });
    expect(boardParams({}, { page: 1 })).toEqual({});
  });

  it('remembers the view per user and falls back to the list', () => {
    expect(viewStorageKey('u1')).toBe('leads.view.u1');
    expect(viewStorageKey(null)).toBe('leads.view.anon');
    expect(parseView('board')).toBe('board');
    expect(parseView('list')).toBe('list');
    expect(parseView('weird')).toBe('list');
    expect(parseView(null)).toBe('list');
  });
});

describe('failureReason', () => {
  it('reads the message of an Error or of the API client plain error object', () => {
    expect(failureReason(new Error('Lost reason is required'))).toBe('Lost reason is required');
    expect(failureReason({ status: 400, message: ' Create an itinerary first ' })).toBe('Create an itinerary first');
    expect(failureReason({ status: 500 })).toBe('');
    expect(failureReason(null)).toBe('');
    expect(failureReason('boom')).toBe('');
  });
});
