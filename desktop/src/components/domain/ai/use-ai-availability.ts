'use client';

import * as React from 'react';

import { useAiSettings } from '@/hooks/use-ai-feature';
import { AiUnavailableError, type AiProviderStatus } from '@/lib/api/ai';

export interface AiAvailability {
  /** True only when /ai/settings says no provider can serve requests. Unknown (loading, older backend) is not "unavailable". */
  unavailable: boolean;
  loading: boolean;
  /** Re-reads /ai/settings, e.g. from a "Try again" button. */
  recheck: () => void;
}

/**
 * Whether the AI provider can serve requests at all, read from
 * GET /ai/settings (`provider.available`). Lets a page show the "AI is not
 * configured yet" notice up-front instead of waiting for a request to fail.
 */
export function useAiAvailability(): AiAvailability {
  const { provider, loading, refetch } = useAiSettings();
  const available = (provider as Partial<AiProviderStatus> | null)?.available;
  return { unavailable: !loading && available === false, loading, recheck: refetch };
}

/** The error object the shared notice renders for the "not configured" state. */
export function useNotConfiguredError(): AiUnavailableError {
  return React.useMemo(() => new AiUnavailableError('not_configured'), []);
}
