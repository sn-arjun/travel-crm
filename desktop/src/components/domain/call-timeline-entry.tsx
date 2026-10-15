'use client';

import * as React from 'react';

import { RecordingPlayButton } from './call-recording';

/** What `log_call_activity` stores for a finished call (snake_case in the database, camelCase from the lead API). */
export interface CallEntryMeta {
  callId?: string;
  direction: 'inbound' | 'outbound';
  result: string;
  durationSeconds: number;
  agentName: string | null;
  note: string | null;
  hasRecording: boolean;
}

/** Reads call metadata from a JSON string or an object, in either key style; null when it is not a call entry. */
export function parseCallMeta(raw: unknown): CallEntryMeta | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const m = obj as Record<string, unknown>;
  const direction = m.direction === 'outbound' ? 'outbound' : m.direction === 'inbound' ? 'inbound' : null;
  if (!direction) return null;
  const pick = (camel: string, snake: string): unknown => (m[camel] !== undefined ? m[camel] : m[snake]);
  return {
    callId: typeof pick('callId', 'call_id') === 'string' ? (pick('callId', 'call_id') as string) : undefined,
    direction,
    result: typeof m.result === 'string' ? m.result : 'completed',
    durationSeconds: Number(pick('durationSeconds', 'duration_seconds')) || 0,
    agentName: typeof pick('agentName', 'agent_name') === 'string' ? (pick('agentName', 'agent_name') as string) : null,
    note: typeof m.note === 'string' && m.note.trim() ? m.note : null,
    hasRecording: Boolean(pick('hasRecording', 'has_recording')),
  };
}

export function formatCallDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

/** "Inbound call, 45 s" / "Outbound call, not answered". */
export function callEntryTitle(meta: CallEntryMeta): string {
  const dir = meta.direction === 'outbound' ? 'Outbound' : 'Inbound';
  return meta.result === 'completed' ? `${dir} call, ${formatCallDuration(meta.durationSeconds)}` : `${dir} call, not answered`;
}

/** The detail under a call entry: agent, note, and a play button once the recording is in our storage. */
export function CallEntryDetail({ meta }: { meta: CallEntryMeta }) {
  const parts = [meta.agentName && `by ${meta.agentName}`, meta.note].filter(Boolean).join(' - ');
  return (
    <span className="inline-flex flex-wrap items-center gap-ds-2" data-testid="call-timeline-entry">
      {parts && <span>{parts}</span>}
      {meta.hasRecording && meta.callId && <RecordingPlayButton callId={meta.callId} />}
    </span>
  );
}
