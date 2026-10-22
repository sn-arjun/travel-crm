import { NextResponse, type NextRequest } from 'next/server';

/**
 * Framing rules of the public booking page (R148, design section 7): /book/<token> may be shown inside an iframe only on the websites
 * the agency allowed (the chat widget's allowed websites, read from GET /public/departures/:token/frame). Anything else, an unknown
 * token or an API that does not answer, gets frame-ancestors 'self'. Only /book/* passes through here.
 */
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787/api/v1').replace(/\/+$/, '');

export async function proxy(request: NextRequest) {
  const token = request.nextUrl.pathname.split('/')[2] ?? '';
  let ancestors: string[] = [];
  if (/^[A-Za-z0-9_-]{22}$/.test(token)) {
    try {
      const res = await fetch(`${API}/public/departures/${token}/frame`, { signal: AbortSignal.timeout(2500), cache: 'no-store' });
      if (res.ok) {
        const body = (await res.json()) as { data?: { ancestors?: unknown } };
        if (Array.isArray(body.data?.ancestors)) {
          ancestors = body.data.ancestors.filter((o): o is string => typeof o === 'string' && /^https?:\/\/[A-Za-z0-9*.\-]+(:\d{1,5})?$/.test(o));
        }
      }
    } catch {
      ancestors = [];
    }
  }
  const response = NextResponse.next();
  response.headers.set('Content-Security-Policy', `frame-ancestors 'self' ${ancestors.join(' ')}`.trim());
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = { matcher: ['/book/:token*'] };
