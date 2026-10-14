// Shared by the provider implementations. Kept out of voip-provider.ts so that file can import the
// implementations statically without a circular import.
import type { VoipProviderName } from './voip-provider';

export class VoipProviderError extends Error {
  constructor(
    public readonly provider: VoipProviderName,
    public readonly code: number | string,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'VoipProviderError';
  }
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
