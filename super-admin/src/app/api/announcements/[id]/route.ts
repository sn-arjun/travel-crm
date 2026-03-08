import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

// PUT /api/announcements/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json() as {
      title?: string;
      body?: string;
      target?: string;
      targetTenantIds?: string[];
      priority?: string;
      expiresAt?: string;
    };
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    const sets: string[] = [];
    const values: unknown[] = [];

    if (body.title !== undefined) { sets.push('title = ?'); values.push(body.title); }
    if (body.body !== undefined) { sets.push('body = ?'); values.push(body.body); }
    if (body.target !== undefined) { sets.push('target = ?'); values.push(body.target); }
    if (body.targetTenantIds !== undefined) { sets.push('target_tenant_ids = ?'); values.push(JSON.stringify(body.targetTenantIds)); }
    if (body.priority !== undefined) { sets.push('priority = ?'); values.push(body.priority); }
    if (body.expiresAt !== undefined) { sets.push('expires_at = ?'); values.push(body.expiresAt); }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    await db.prepare(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Update announcement error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/announcements/:id (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { env } = await getCloudflareContext();
    const db = env.MASTER_DB;

    await db.prepare('UPDATE announcements SET is_active = 0 WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete announcement error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
