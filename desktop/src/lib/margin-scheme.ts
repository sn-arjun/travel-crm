/**
 * Margin scheme helpers (R152): the preview figures staff see on an invoice, and the wording presets of Settings.
 *
 * Nothing here is tax advice. The presets are suggestions the agency chooses and may edit; every one is shown with
 * "check with your accountant". No tax rate is seeded anywhere: the VAT on the margin is computed only from the rate the
 * agency entered. The arithmetic mirrors the API (backend/src/services/tax-calculator.ts): the margin is VAT-inclusive,
 * so the VAT in it is margin x rate / (100 + rate), rounded half-up to the minor unit.
 */

const toMinor = (amount: number) => Math.round(Number((amount * 100).toPrecision(12)));

/** VAT contained in a margin, in currency units. A margin of zero or less carries none. */
export function vatOnMargin(margin: number, ratePercent: number): number {
  const marginMinor = toMinor(margin);
  if (!(marginMinor > 0) || !(ratePercent > 0)) return 0;
  const rateMilli = Math.round(ratePercent * 1000);
  const denom = 100000 + rateMilli;
  return Math.floor((marginMinor * rateMilli * 2 + denom) / (denom * 2)) / 100;
}

export interface MarginPreviewInput {
  /** What the buyer pays (the invoice total). */
  price: number;
  /** null = the cost is not recorded. */
  cost: number | null | undefined;
  /** null = the agency has not entered a rate. */
  vatRate: number | null | undefined;
}

export interface MarginPreview {
  /** price - cost; null while the cost is not recorded. */
  margin: number | null;
  /** null when the cost or the rate is missing: nothing is guessed. */
  vatOnMargin: number | null;
  /** True when both the cost and the rate are known. */
  complete: boolean;
}

export function marginPreview({ price, cost, vatRate }: MarginPreviewInput): MarginPreview {
  if (cost === null || cost === undefined) return { margin: null, vatOnMargin: null, complete: false };
  const margin = (toMinor(price) - toMinor(cost)) / 100;
  if (vatRate === null || vatRate === undefined) return { margin, vatOnMargin: null, complete: false };
  return { margin, vatOnMargin: vatOnMargin(margin, vatRate), complete: true };
}

export interface WordingPreset {
  id: 'eu' | 'nl' | 'uk';
  /** Catalogue key of the preset's name. */
  labelKey: string;
  /** Text put into the wording field when the agency picks the preset; editable afterwards. */
  wording: string;
}

/**
 * Wording presets (design 12). They are offered as buttons, never applied silently, and the UI says next to them
 * to check with an accountant.
 */
export const WORDING_PRESETS: readonly WordingPreset[] = [
  { id: 'eu', labelKey: 'margin.preset.eu', wording: 'Margin scheme — Travel agents' },
  { id: 'nl', labelKey: 'margin.preset.nl', wording: 'Bijzondere regeling reisbureaus' },
  { id: 'uk', labelKey: 'margin.preset.uk', wording: "Tour Operators' Margin Scheme: VAT is included in the price and not shown separately" },
];

/** Staff may see the cost and margin of a margin invoice only with invoice edit rights; the PDF never shows them. */
export function marginFiguresVisible(canEditInvoices: boolean, regime: string): boolean {
  return canEditInvoices && regime === 'margin';
}
