'use client';

import * as React from 'react';

import { getApiBaseUrl } from '@/lib/api/config';
import type { TripPage } from '@/lib/extras';
import { useI18n } from '@/lib/i18n';
import { setLocaleContext } from '@/lib/locale';
import { startLanguage } from '@/app/(public)/book/[token]/_components/public-i18n';

export type TripState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: TripPage }
  | { kind: 'missing' }
  | { kind: 'gone' }
  | { kind: 'error' };

/** The answer of a refused request: `{ success: false, error: { code, message, errors? } }`. */
export interface TripRefusal {
  status: number;
  code: string;
  message: string;
  errors: Array<{ ref: string; field: string }>;
}

export type TripResult<T> = { ok: true; data: T } | { ok: false; refusal: TripRefusal };

/** One call to the self-service API of this link. Never throws: a lost connection is a refusal with status 0. */
export async function tripRequest<T = TripPage>(token: string, method: 'GET' | 'PUT' | 'POST', suffix = '', body?: unknown): Promise<TripResult<T>> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/public/booking/${encodeURIComponent(token)}${suffix}`, {
      method,
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { code?: string; message?: string; errors?: Array<{ ref: string; field: string }> } };
    if (res.ok && json.success && json.data !== undefined) return { ok: true, data: json.data };
    return { ok: false, refusal: { status: res.status, code: json.error?.code ?? 'ERROR', message: json.error?.message ?? '', errors: json.error?.errors ?? [] } };
  } catch {
    return { ok: false, refusal: { status: 0, code: 'NETWORK', message: '', errors: [] } };
  }
}

/**
 * Loads the page of a link and keeps it. Money, dates and the phone picker follow the agency whatever this visitor's browser says,
 * and the page opens in the agency's language (or `?lang=` when the agency offers it).
 */
export function useTrip(token: string) {
  const { setLocale } = useI18n();
  const [state, setState] = React.useState<TripState>({ kind: 'loading' });
  const first = React.useRef(true);

  const apply = React.useCallback(
    (page: TripPage) => {
      setLocaleContext({ currency: page.currency, locale: page.locale.locale, timeZone: page.locale.timeZone, country: page.locale.country, phoneDefaultCountry: page.locale.phoneDefaultCountry });
      if (first.current) {
        first.current = false;
        setLocale(startLanguage(page.language.available, page.language.default, new URLSearchParams(window.location.search).get('lang')));
      }
      document.title = [page.tour.title, page.agency.name].filter(Boolean).join(' - ');
      setState({ kind: 'ready', page });
    },
    [setLocale],
  );

  const load = React.useCallback(async () => {
    const result = await tripRequest(token, 'GET');
    if (result.ok) return apply(result.data);
    const { status } = result.refusal;
    setState({ kind: status === 404 ? 'missing' : status === 410 ? 'gone' : 'error' });
  }, [token, apply]);

  React.useEffect(() => {
    if (token) void load();
  }, [token, load]);

  const retry = () => {
    setState({ kind: 'loading' });
    void load();
  };

  return { state, apply, retry };
}
