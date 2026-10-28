import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';

import type { RegulatoryState } from '@/lib/api/voip';
import { BUNDLE_STATES, BundleStatus } from './bundle-status';

const CHIPS: Record<RegulatoryState, string> = {
  none: 'Not started',
  submitted: 'Submitted',
  platform_review: 'Platform review',
  provider_review: 'Provider review',
  approved: 'Approved',
  rejected: 'Rejected',
};

describe('BundleStatus', () => {
  it.each(BUNDLE_STATES)('shows the chip and a message for %s', (state) => {
    render(<BundleStatus state={state} />);
    expect(screen.getByTestId('bundle-chip').textContent).toBe(CHIPS[state]);
    expect(screen.getByTestId('bundle-status').getAttribute('data-state')).toBe(state);
    expect(screen.getByTestId('bundle-message').textContent?.length).toBeGreaterThan(10);
  });

  it('says the provider is reviewing and that an e-mail follows, without promising a duration', () => {
    render(<BundleStatus state="provider_review" />);
    const text = screen.getByTestId('bundle-message').textContent ?? '';
    expect(text).toBe('Under review by the phone provider. We will email you when it is approved.');
    expect(text).not.toMatch(/\d/);
  });

  it('offers to send the documents only when nothing was sent', () => {
    const onStart = vi.fn();
    const { rerender } = render(<BundleStatus state="none" onStart={onStart} onResubmit={() => undefined} />);
    fireEvent.click(screen.getByTestId('bundle-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('bundle-resubmit')).toBeNull();
    for (const state of ['submitted', 'platform_review', 'provider_review', 'approved'] as const) {
      rerender(<BundleStatus state={state} onStart={onStart} onResubmit={() => undefined} />);
      expect(screen.queryByTestId('bundle-start')).toBeNull();
      expect(screen.queryByTestId('bundle-resubmit')).toBeNull();
    }
  });

  it('shows the reason and a Resubmit action when rejected', () => {
    const onResubmit = vi.fn();
    render(<BundleStatus state="rejected" failureReason="The extract is unreadable" onResubmit={onResubmit} />);
    expect(screen.getByTestId('bundle-reason').textContent).toBe('Reason: The extract is unreadable');
    fireEvent.click(screen.getByTestId('bundle-resubmit'));
    expect(onResubmit).toHaveBeenCalledTimes(1);
  });

  it('still tells the agency what to do when a rejection has no reason', () => {
    render(<BundleStatus state="rejected" failureReason={null} onResubmit={() => undefined} />);
    expect(screen.getByTestId('bundle-reason').textContent).toContain('No reason was given');
  });
});
