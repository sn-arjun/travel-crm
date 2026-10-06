export type MethodTone = 'info' | 'success' | 'warning' | 'neutral';

export const methodTone: Record<string, MethodTone> = {
  bank_transfer: 'info',
  transfer: 'info',
  upi: 'info',
  cash: 'success',
  card: 'warning',
  cheque: 'neutral',
  check: 'neutral',
};

export const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  transfer: 'Bank Transfer',
  upi: 'UPI',
  cash: 'Cash',
  card: 'Card',
  cheque: 'Cheque',
  check: 'Cheque',
  other: 'Other',
};

export function labelForMethod(method: string | null | undefined): string {
  if (!method) return '—';
  return methodLabel[method] ?? method.replace(/_/g, ' ');
}
