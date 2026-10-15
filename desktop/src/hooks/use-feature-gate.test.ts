import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const settings = vi.hoisted(() => ({
  value: {
    loading: false,
    features: [{ key: 'voip_calling', enabled: true, tier: 'pro', overridden: false }],
    usageCaps: {},
    voipCalling: null as null | { available: boolean; country: string; reason: string },
  },
}));

vi.mock('./use-ai-feature', () => ({ useAiSettings: () => settings.value }));

import { useFeatureGate, useCallingOffered } from './use-feature-gate';

describe('calling country gate (R301)', () => {
  beforeEach(() => {
    settings.value = {
      loading: false,
      features: [{ key: 'voip_calling', enabled: true, tier: 'pro', overridden: false }],
      usageCaps: {},
      voipCalling: null,
    };
  });

  it('a UK agency on a calling plan may call and sees calling', () => {
    settings.value.voipCalling = { available: true, country: 'GB', reason: 'ok' };
    expect(renderHook(() => useFeatureGate('voip_calling')).result.current).toMatchObject({ enabled: true, reason: 'ok' });
    expect(renderHook(() => useCallingOffered()).result.current).toBe(true);
  });

  it('an Indian agency is told calling is unavailable, not offered an upgrade, and calling UI is hidden', () => {
    settings.value.voipCalling = { available: false, country: 'IN', reason: 'country_not_supported' };
    expect(renderHook(() => useFeatureGate('voip_calling')).result.current).toMatchObject({ enabled: false, reason: 'country_unavailable' });
    expect(renderHook(() => useCallingOffered()).result.current).toBe(false);
  });

  it('other gated features are not affected by the calling country', () => {
    settings.value.voipCalling = { available: false, country: 'IN', reason: 'country_not_supported' };
    settings.value.features = [{ key: 'ai_assistant', enabled: true, tier: 'pro', overridden: false }];
    expect(renderHook(() => useFeatureGate('ai_assistant')).result.current).toMatchObject({ enabled: true, reason: 'ok' });
  });

  it('while settings load, calling navigation is not hidden (no flash)', () => {
    settings.value.loading = true;
    expect(renderHook(() => useCallingOffered()).result.current).toBe(true);
  });
});
