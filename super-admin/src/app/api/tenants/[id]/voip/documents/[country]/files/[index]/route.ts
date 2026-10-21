import { NextRequest, NextResponse } from 'next/server';
import { backendStream } from '@/lib/backend';

/**
 * Opens one file an agency uploaded for its number application. The generic /api proxy only passes JSON through, so a file
 * needs its own handler: it asks the backend for the file with the operator's session and streams the bytes back unchanged.
 * The backend decides (super admin only, the file must belong to that agency's document set) and records every open.
 */
const TENANT_ID = /^[0-9a-f-]{36}$/i;
const COUNTRY = /^[A-Za-z]{2}$/;
const INDEX = /^\d{1,3}$/;

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string; country: string; index: string }> }) {
  const { id, country, index } = await ctx.params;
  if (!TENANT_ID.test(id) || !COUNTRY.test(country) || !INDEX.test(index)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return backendStream(`/tenants/${id}/voip/documents/${country.toUpperCase()}/files/${index}`);
}
