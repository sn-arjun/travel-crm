import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import * as React from 'react';

const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));

import { ListPage, type ListPageProps } from './list-page';

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

interface Row {
  id: string;
  name: string;
}

const columns = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'other', header: 'Other', sortable: true },
];

function page(rows: Row[], total = rows.length) {
  return { success: true, data: rows, pagination: { page: 1, limit: 20, total, totalPages: 1 } };
}

type Fetcher = ListPageProps<Row>['fetcher'];

function callArg(fn: { mock: { calls: unknown[][] } }, i: number) {
  return fn.mock.calls[i]![0] as Parameters<Fetcher>[0];
}

function Harness({
  fetcher,
  refreshKey,
  serverSort,
  onExport,
}: {
  fetcher: Fetcher;
  refreshKey?: number;
  serverSort?: boolean;
  onExport?: () => Promise<void>;
}) {
  const [count, setCount] = React.useState(0);
  return (
    <>
      <button onClick={() => setCount((c) => c + 1)}>rerender {count}</button>
      {/* inline fetcher: a new function identity on every render */}
      <ListPage<Row>
        title="Widgets"
        columns={columns}
        getRowId={(r) => r.id}
        fetcher={(p) => fetcher(p)}
        refreshKey={refreshKey}
        serverSort={serverSort}
        onExport={onExport}
      />
    </>
  );
}

describe('ListPage', () => {
  beforeEach(() => {
    toastError.mockClear();
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not refetch when the parent re-renders with an inline fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    render(<Harness fetcher={fetcher} />);
    await screen.findByText('Alpha');
    expect(fetcher).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/rerender/));
    fireEvent.click(screen.getByText(/rerender/));
    await act(async () => {});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('shows the real total from the standard list envelope', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }], 77));
    render(<Harness fetcher={fetcher} />);
    await screen.findByText('Alpha');
    expect(screen.getByText('77')).toBeTruthy();
  });

  it('refetches from page 1 when refreshKey changes', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    const { rerender } = render(<Harness fetcher={fetcher} refreshKey={0} />);
    await screen.findByText('Alpha');
    expect(fetcher).toHaveBeenCalledTimes(1);

    rerender(<Harness fetcher={fetcher} refreshKey={1} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(callArg(fetcher, 1)).toMatchObject({ page: 1 });
  });

  it('passes the sort to the fetcher when serverSort is on', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    render(<Harness fetcher={fetcher} serverSort />);
    await screen.findByText('Alpha');
    expect(callArg(fetcher, 0).sort).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(callArg(fetcher, 1).sort).toEqual({ column: 'name', direction: 'asc' });

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(callArg(fetcher, 2).sort).toEqual({ column: 'name', direction: 'desc' });
  });

  it('does not render clickable sort headers without serverSort', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    render(<Harness fetcher={fetcher} />);
    await screen.findByText('Alpha');
    expect(screen.queryByRole('button', { name: /^Name$/ })).toBeNull();
  });

  it('shows an error panel with Retry that calls the fetcher again', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, message: 'Server exploded' })
      .mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    render(<Harness fetcher={fetcher} />);

    expect(await screen.findByText("Couldn't load widgets")).toBeTruthy();
    expect(screen.getByText('Server exploded')).toBeTruthy();
    expect(screen.queryByText('Nothing here yet')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Alpha');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('toasts when export fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([{ id: '1', name: 'Alpha' }]));
    const onExport = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Harness fetcher={fetcher} onExport={onExport} />);
    await screen.findByText('Alpha');

    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Failed to export widgets'));
    // spinner reset: button usable again
    await waitFor(() => expect((screen.getByRole('button', { name: /Export/ }) as HTMLButtonElement).disabled).toBe(false));
  });
});
