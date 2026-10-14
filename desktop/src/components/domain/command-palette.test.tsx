import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import * as React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const contactsList = vi.fn();
const leadsList = vi.fn();
const invoicesList = vi.fn();
vi.mock('@/lib/api/contacts', () => ({ contactsApi: { list: (...a: unknown[]) => contactsList(...a) } }));
vi.mock('@/lib/api/leads', () => ({ leadsApi: { list: (...a: unknown[]) => leadsList(...a) } }));
vi.mock('@/lib/api/invoices', () => ({ invoicesApi: { list: (...a: unknown[]) => invoicesList(...a) } }));

import { CommandPalette, searchEntities } from './command-palette';

const page = (rows: unknown[]) => ({ success: true, data: { data: rows, pagination: { page: 1, limit: 5, total: rows.length, totalPages: 1 } } });

beforeEach(() => {
  vi.clearAllMocks();
  contactsList.mockResolvedValue(page([{ id: 'c1', name: 'Asha Rao', email: 'asha@example.com' }]));
  leadsList.mockResolvedValue(page([{ id: 'l1', title: 'Goa trip for Asha', status: 'new' }]));
  invoicesList.mockResolvedValue(page([{ id: 'i1', invoiceNumber: 'INV-2026-27-0001', contactName: 'Asha Rao' }]));
});

describe('searchEntities', () => {
  it('does not call anything for fewer than 2 characters', async () => {
    expect(await searchEntities('a')).toEqual([]);
    expect(contactsList).not.toHaveBeenCalled();
  });

  it('searches contacts, leads and invoices with the search term and a limit of 5', async () => {
    const hits = await searchEntities('asha');
    expect(contactsList).toHaveBeenCalledWith({ search: 'asha', limit: 5 });
    expect(leadsList).toHaveBeenCalledWith({ search: 'asha', limit: 5 });
    expect(invoicesList).toHaveBeenCalledWith({ search: 'asha', limit: 5 });
    expect(hits.map((h) => h.href)).toEqual(['/contacts/c1', '/leads/l1', '/invoices/i1']);
  });

  it('keeps the other sections when one endpoint fails', async () => {
    leadsList.mockRejectedValue(new Error('boom'));
    const hits = await searchEntities('asha');
    expect(hits.map((h) => h.kind)).toEqual(['contact', 'invoice']);
  });
});

describe('CommandPalette', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  async function openAndType(text: string) {
    render(<CommandPalette />);
    await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    const input = screen.getByPlaceholderText(/Type a command/);
    await act(async () => { fireEvent.change(input, { target: { value: text } }); });
    return input;
  }

  it('has an accessible dialog title', async () => {
    render(<CommandPalette />);
    await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('waits 250 ms before searching and then shows records that navigate to their detail page', async () => {
    await openAndType('asha');
    expect(contactsList).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(260); });
    expect(contactsList).toHaveBeenCalledTimes(1);
    const invoice = screen.getByText('INV-2026-27-0001');
    fireEvent.click(invoice);
    expect(push).toHaveBeenCalledWith('/invoices/i1');
  });

  it('typing again within the debounce window searches once, for the last text', async () => {
    const input = await openAndType('as');
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    await act(async () => { fireEvent.change(input, { target: { value: 'asha' } }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(contactsList).toHaveBeenCalledTimes(1);
    expect(contactsList).toHaveBeenCalledWith({ search: 'asha', limit: 5 });
  });

  it('ignores a stale answer that arrives after the query changed', async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    contactsList.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }));
    const input = await openAndType('asha');
    await act(async () => { await vi.advanceTimersByTimeAsync(260); });
    await act(async () => { fireEvent.change(input, { target: { value: 'zzz' } }); });
    await act(async () => { resolveFirst(page([{ id: 'c9', name: 'Stale Person' }])); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.queryByText('Stale Person')).toBeNull();
  });
});
