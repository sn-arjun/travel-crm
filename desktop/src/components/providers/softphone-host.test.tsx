import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// R135-5: the app asks for a softphone token only where calling is on for the agency.

const start = vi.fn().mockResolvedValue(undefined);
const stop = vi.fn().mockResolvedValue(undefined);
const gate = { enabled: true, loading: false };
const settings: { voipCalling: { accountActive?: boolean } | null } = { voipCalling: { accountActive: true } };

vi.mock('@/lib/softphone/use-softphone', () => ({
  appSoftphone: () => ({ start, stop, getSoftphone: () => null }),
  useSoftphone: () => ({ status: 'idle', controller: { getSoftphone: () => null } }),
}));
vi.mock('@/hooks/use-feature-gate', () => ({ useFeatureGate: () => gate }));
vi.mock('@/hooks/use-ai-feature', () => ({ useAiSettings: () => settings }));
vi.mock('@/components/domain/call-controls-panel', () => ({ CallControlsPanel: () => null }));
vi.mock('@/components/domain/mic-check', () => ({ FirstCallMicCheck: () => null }));
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ isAuthenticated: true, user: { id: 'u1', role: 'salesperson' }, mustChangePassword: false, twoFactorSetupRequired: false }),
}));
vi.mock('@/stores/realtime-store', () => ({ useRealtimeStore: (sel: (s: unknown) => unknown) => sel({ subscribe: () => () => {} }) }));
vi.mock('@/stores/softphone-store', () => ({ useSoftphoneStore: (sel: (s: unknown) => unknown) => sel({ answered: null, setAnswered: () => {} }) }));

import { SoftphoneHost } from './softphone-host';

describe('SoftphoneHost token request', () => {
  beforeEach(() => {
    start.mockClear();
    gate.enabled = true;
    gate.loading = false;
    settings.voipCalling = { accountActive: true };
  });

  it('registers the phone when calling is on', () => {
    render(<SoftphoneHost />);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not touch the phone (no /voip/token request) when the agency has no calling account', () => {
    settings.voipCalling = { accountActive: false };
    render(<SoftphoneHost />);
    expect(start).not.toHaveBeenCalled();
  });

  it('does not touch the phone where calling is off by plan or country, or while settings load', () => {
    gate.enabled = false;
    render(<SoftphoneHost />);
    expect(start).not.toHaveBeenCalled();
    gate.enabled = true;
    gate.loading = true;
    render(<SoftphoneHost />);
    expect(start).not.toHaveBeenCalled();
  });
});
