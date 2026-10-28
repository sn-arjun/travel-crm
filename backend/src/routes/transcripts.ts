/**
 * Transcript Routes — TICKET-392, 397
 *
 * CRUD for call transcripts + FTS5 search.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { canAccessCallData } from '../services/voip/recordings';

const transcriptRoutes = new Hono<AppContext>();

// ── GET /:callLogId — Get transcript for a call ─────────────

transcriptRoutes.get('/:callLogId', async (c) => {
  const db = c.get('tenantDb');
  const callLogId = c.req.param('callLogId');
  // R306 (CALL-AUTOMATION 3.7): admin and sales manager read every transcript, a salesperson their own calls, nobody else.
  if (!(await canAccessCallData(db, c.get('role'), c.get('userId'), callLogId, 'transcript'))) {
    return error(c, 'You do not have access to this transcript', 403);
  }

  const row = await db.prepare(`
    SELECT ct.*, u.name as edited_by_name
    FROM call_transcripts ct
    LEFT JOIN users u ON ct.edited_by = u.id
    WHERE ct.call_log_id = ?
  `).bind(callLogId).first<Record<string, any>>();

  // R135-6: a call without a transcript yet is a normal state, not an error: answer 200 with null.
  if (!row) return success(c, null);

  return success(c, {
    id: row.id,
    callLogId: row.call_log_id,
    fullTranscript: row.full_transcript,
    speakerSegments: row.speaker_segments ? JSON.parse(row.speaker_segments) : null,
    language: row.language,
    confidence: row.confidence,
    wordCount: row.word_count,
    durationSeconds: row.duration_seconds,
    transcriptionModel: row.transcription_model,
    isEdited: !!row.is_edited,
    editedBy: row.edited_by,
    editedByName: row.edited_by_name,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  });
});

// ── PUT /:callLogId — Edit transcript ────────────────────────

const updateTranscriptSchema = z.object({
  fullTranscript: z.string().min(1),
});

transcriptRoutes.put('/:callLogId', zValidator('json', updateTranscriptSchema), async (c) => {
  const db = c.get('tenantDb');
  const userId = c.get('userId');
  const callLogId = c.req.param('callLogId');
  const { fullTranscript } = c.req.valid('json');
  if (!(await canAccessCallData(db, c.get('role'), userId, callLogId, 'transcript'))) {
    return error(c, 'You do not have access to this transcript', 403);
  }

  const existing = await db.prepare(
    'SELECT id FROM call_transcripts WHERE call_log_id = ?'
  ).bind(callLogId).first<{ id: string }>();

  if (!existing) return notFound(c, 'Transcript');

  await db.prepare(`
    UPDATE call_transcripts
    SET full_transcript = ?, is_edited = 1, edited_by = ?,
        edited_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
        word_count = ?
    WHERE call_log_id = ?
  `).bind(
    fullTranscript,
    userId,
    fullTranscript.split(/\s+/).length,
    callLogId,
  ).run();

  return success(c, { message: 'Transcript updated' });
});

// ── GET /search — FTS5 full-text search (TICKET-397) ─────────

transcriptRoutes.get('/', async (c) => {
  const db = c.get('tenantDb');
  const url = new URL(c.req.url);

  const query = url.searchParams.get('q');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  if (!query || query.trim().length === 0) {
    return error(c, 'Search query required', 400);
  }

  // R306: searching reads snippets of every transcript, so it is limited to the roles that may read them all.
  if (c.get('role') !== 'admin' && c.get('role') !== 'sales_manager') {
    return error(c, 'Only an administrator or sales manager can search all transcripts', 403);
  }

  // FTS5 treats characters such as - " : * ( ) as query syntax, so a raw user
  // term like "non-refundable" is a syntax error. Quote each term as a phrase.
  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"`)
    .join(' ');

  // Count matches
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total
    FROM call_transcripts ct
    INNER JOIN call_transcripts_fts fts ON ct.rowid = fts.rowid
    WHERE call_transcripts_fts MATCH ?
  `).bind(ftsQuery).first<{ total: number }>();

  const total = countResult?.total ?? 0;

  // Search with snippets
  const rows = await db.prepare(`
    SELECT ct.id, ct.call_log_id, ct.language, ct.confidence,
           ct.word_count, ct.duration_seconds, ct.created_at,
           cl.direction, cl.from_number, cl.to_number, cl.status as call_status,
           c.name as contact_name,
           snippet(call_transcripts_fts, 0, '<mark>', '</mark>', '...', 40) as snippet
    FROM call_transcripts ct
    INNER JOIN call_transcripts_fts fts ON ct.rowid = fts.rowid
    LEFT JOIN call_logs cl ON ct.call_log_id = cl.id
    LEFT JOIN contacts c ON cl.contact_id = c.id
    WHERE call_transcripts_fts MATCH ?
    ORDER BY rank
    LIMIT ? OFFSET ?
  `).bind(ftsQuery, limit, offset).all();

  return c.json({
    success: true,
    data: (rows.results || []).map((r: any) => ({
      id: r.id,
      callLogId: r.call_log_id,
      snippet: r.snippet,
      language: r.language,
      confidence: r.confidence,
      wordCount: r.word_count,
      durationSeconds: r.duration_seconds,
      direction: r.direction,
      fromNumber: r.from_number,
      toNumber: r.to_number,
      callStatus: r.call_status,
      contactName: r.contact_name,
      createdAt: r.created_at,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  });
});

export default transcriptRoutes;
