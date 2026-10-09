import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import * as React from 'react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) } }));

const apply = vi.fn();
const dismiss = vi.fn();
const undo = vi.fn();
vi.mock('@/lib/api/assistant', () => ({
  assistantApi: {
    apply: (...a: unknown[]) => apply(...a),
    dismiss: (...a: unknown[]) => dismiss(...a),
    undo: (...a: unknown[]) => undo(...a),
  },
}));
vi.mock('@/lib/api/contacts', () => ({ contactsApi: { getById: vi.fn() } }));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/communication/send-message-dialog', () => ({ SendMessageDialog: () => null }));

import { SuggestionCard } from './suggestion-card';
import { suggestionHref } from './suggestion-target';
import type { Suggestion } from '@/lib/api/assistant';

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
  return {
    id: 's1',
    ruleKey: 'inbox.read_messages',
    ruleTitle: 'Read every incoming message',
    origin: 'rule',
    entityType: 'message',
    entityId: 'm1',
    contactId: null,
    leadId: null,
    sourceType: 'message',
    sourceId: 'm1',
    action: { type: 'create_lead_from_enquiry', label: 'Create lead', risk: 'medium', clientHandled: false },
    params: {
      name: 'Priya Nair',
      phone: '+919845023117',
      title: 'Kerala family trip: Priya Nair',
      destinations: ['Kerala', 'Munnar'],
      travelDate: '2026-12-18',
      returnDate: '2026-12-23',
      paxAdults: 2,
      paxChildren: 2,
      budget: 125000,
    },
    title: 'Create contact and lead for Priya Nair',
    reason: 'Kerala, Munnar, 5 nights, from 18 Dec, 2 adults + 2 children, ₹1,25,000',
    confidence: 0.7,
    status: 'pending',
    result: null,
    error: null,
    canApply: true,
    canUndo: false,
    assignedTo: null,
    appliedBy: null,
    appliedAt: null,
    modelUsed: null,
    createdAt: '2026-10-08T10:00:00Z',
    ...overrides,
  };
}

describe('SuggestionCard', () => {
  beforeEach(() => {
    apply.mockReset();
    dismiss.mockReset();
    undo.mockReset();
    push.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('shows what will be created before anything is clicked', () => {
    render(<SuggestionCard suggestion={suggestion()} />);
    expect(screen.getByText('Create contact and lead for Priya Nair')).toBeTruthy();
    expect(screen.getByText('Kerala family trip: Priya Nair')).toBeTruthy();
    expect(screen.getByText('Priya Nair · +919845023117')).toBeTruthy();
    expect(screen.getByText('Kerala, Munnar')).toBeTruthy();
    expect(screen.getByText('2 adults + 2 children')).toBeTruthy();
    expect(screen.getByText('₹1,25,000')).toBeTruthy();
  });

  it('applies in one click with the stored values', async () => {
    apply.mockResolvedValue({ data: { result: { summary: 'Created Priya Nair and the lead', entities: [] } } });
    const onChanged = vi.fn();
    render(<SuggestionCard suggestion={suggestion()} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(apply).toHaveBeenCalledWith('s1', undefined);
    expect(toastSuccess).toHaveBeenCalledWith('Created Priya Nair and the lead');
  });

  it('sends edited values when the person edits first', async () => {
    apply.mockResolvedValue({ data: { result: { summary: null, entities: [] } } });
    render(<SuggestionCard suggestion={suggestion()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit first' }));
    fireEvent.change(screen.getByLabelText('Lead title'), { target: { value: 'Kerala Backwaters Family Holiday' } });
    fireEvent.change(screen.getByLabelText('Adults'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));

    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply).toHaveBeenCalledWith('s1', {
      title: 'Kerala Backwaters Family Holiday',
      travelDate: '2026-12-18',
      paxAdults: 3,
      paxChildren: 2,
      budget: 125000,
    });
  });

  it('reports a failure and stays available', async () => {
    apply.mockRejectedValue({ status: 422, message: 'A name, phone number or email is needed to create the contact' });
    render(<SuggestionCard suggestion={suggestion()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('A name, phone number or email is needed to create the contact'));
    expect((screen.getByRole('button', { name: 'Create lead' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers no button to someone whose role cannot do it', () => {
    render(<SuggestionCard suggestion={suggestion({ canApply: false })} />);
    expect(screen.queryByRole('button', { name: 'Create lead' })).toBeNull();
    expect(screen.getByText(/Your role cannot do this/)).toBeTruthy();
  });

  it('dismisses', async () => {
    dismiss.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<SuggestionCard suggestion={suggestion()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(dismiss).toHaveBeenCalledWith('s1');
  });

  it('shows what an automatic run created and lets it be undone', async () => {
    undo.mockResolvedValue({});
    const done = suggestion({
      status: 'auto_applied',
      canApply: false,
      canUndo: true,
      title: 'Follow up on "Kerala family trip"',
      action: { type: 'create_follow_up', label: 'Schedule follow-up', risk: 'low', clientHandled: false },
      result: { summary: 'Follow-up scheduled', entities: [{ type: 'lead', id: 'l1', label: 'Kerala family trip' }] },
    });
    render(<SuggestionCard suggestion={done} />);

    expect(screen.getByText('Done automatically')).toBeTruthy();
    expect(screen.getByText('Follow-up scheduled')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Lead: Kerala family trip/ }).getAttribute('href')).toBe('/leads/l1');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(undo).toHaveBeenCalledWith('s1'));
  });
});

describe('SuggestionCard: open a pre-filled form', () => {
  const transfer = () =>
    suggestion({
      title: 'Book the arrival transfer for Meera Pillai',
      action: { type: 'open_prefilled_form', label: 'Open form', risk: 'medium', clientHandled: true },
      params: {
        href: '/fleet/trips/new?leadId=l1&vehicleId=v1&driverId=d1',
        buttonLabel: 'Open trip form',
        details: [
          { label: 'Vehicle', value: 'Toyota Innova Crysta (KA 05 MN 4521), 7 seats' },
          { label: 'Driver', value: 'Ravi Kumar' },
        ],
      },
    });

  beforeEach(() => {
    apply.mockReset();
    push.mockReset();
  });

  it('shows what it found and opens the form with those values', async () => {
    apply.mockResolvedValue({ data: {} });
    render(<SuggestionCard suggestion={transfer()} />);
    expect(screen.getByText('Toyota Innova Crysta (KA 05 MN 4521), 7 seats')).toBeTruthy();
    expect(screen.getByText('Ravi Kumar')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open trip form' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/fleet/trips/new?leadId=l1&vehicleId=v1&driverId=d1'));
    expect(apply).toHaveBeenCalledWith('s1');
  });

  it('still opens the form when the suggestion cannot be marked as used', async () => {
    apply.mockRejectedValue(new Error('offline'));
    render(<SuggestionCard suggestion={transfer()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open trip form' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it('never navigates outside the app', async () => {
    apply.mockResolvedValue({ data: {} });
    const outside = transfer();
    outside.params = { ...outside.params, href: 'https://evil.example/phish' };
    render(<SuggestionCard suggestion={outside} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open trip form' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(push).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('suggestionHref', () => {
  it('opens the record a suggestion is about', () => {
    expect(suggestionHref({ entityType: 'lead', entityId: 'l1', leadId: 'l1', contactId: 'c1' })).toBe('/leads/l1');
    expect(suggestionHref({ entityType: 'invoice', entityId: 'i1', leadId: null, contactId: 'c1' })).toBe('/invoices/i1');
    expect(suggestionHref({ entityType: 'contact', entityId: 'c1', leadId: null, contactId: 'c1' })).toBe('/communication/c1');
    expect(suggestionHref({ entityType: 'message', entityId: 'm1', leadId: null, contactId: null })).toBe('/communication');
    expect(suggestionHref({ entityType: 'message', entityId: 'm1', leadId: 'l9', contactId: 'c1' })).toBe('/leads/l9');
  });
});
