'use client';

import * as React from 'react';
import { Copy, FileText, Plus, Sparkles } from 'lucide-react';
import { Button, EmptyState, Skeleton, Tag, SectionCard } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type CallSummary, type Transcript } from '@/lib/api/voip';
import { toast } from 'sonner';

interface CallTranscriptPanelProps {
  callId: string;
  onCreateLead?: () => void;
  onAddFollowUp?: () => void;
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** What the call AI did with the call, in words the agent can act on. */
function aiStatusText(summary: CallSummary | null): string | null {
  if (!summary) return null;
  if (summary.aiStatus === 'queued') return 'Transcribing and summarising this call...';
  if (summary.aiStatus === 'skipped' || summary.aiStatus === 'failed') return summary.aiStatusReason ?? 'Not summarised';
  return null;
}

/**
 * The AI summary of a call (3 lines and the next steps) with its state: queued, summarised, or "Not summarised: AI credits
 * used up" with a button to run it now. Suggestions made from it (lead update, tasks, a drafted message) appear in the
 * Assistant and need a click; nothing here changes the lead.
 */
export function CallSummaryCard({ callId }: { callId: string }) {
  const { data, loading, refetch } = useApiQuery<{ data: CallSummary }>(() => voipApi.calls.summary(callId), [callId]);
  const [busy, setBusy] = React.useState(false);
  const summary = data?.data ?? null;
  const status = aiStatusText(summary);
  const actionable = summary?.aiStatus === 'skipped' || summary?.aiStatus === 'failed';

  // Nothing to show for a call the call AI never looked at (it is off, or the viewer may not read summaries).
  if (loading || (!summary?.summary && !summary?.aiStatus)) return null;

  const run = async () => {
    setBusy(true);
    try {
      await voipApi.calls.summarise(callId);
      toast.success('Summarising this call');
      refetch();
    } catch (error) {
      toast.error((error as { message?: string } | null)?.message || 'Could not summarise this call');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="call-summary-card">
    <SectionCard title="AI summary">
      <div className="flex flex-col gap-ds-3">
        {summary?.summary ? (
          <>
            <ul className="list-disc space-y-ds-1 ps-ds-5 text-sm">
              {summary.summary.bullets.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {summary.summary.actionItems.length > 0 && (
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">Next steps</p>
                <ul className="list-disc space-y-ds-1 ps-ds-5 text-sm">
                  {summary.summary.actionItems.map((item, i) => (
                    <li key={i}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-ds-foreground-muted">Suggested changes are in the Assistant. Nothing is applied until you click.</p>
          </>
        ) : status ? (
          <div className="flex flex-wrap items-center gap-ds-3">
            <Tag tone={summary?.aiStatus === 'queued' ? 'info' : 'warning'} data-testid="call-ai-status">{status}</Tag>
            {actionable && (
              <Button size="sm" variant="outline" onClick={() => void run()} disabled={busy} className="gap-ds-2" data-testid="call-summarise-now">
                <Sparkles aria-hidden="true" /> {summary?.aiStatus === 'failed' ? 'Try again' : 'Summarise now'}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </SectionCard>
    </div>
  );
}

/** Real transcript for a call. Shows an honest empty state when none was recorded. */
export function CallTranscriptPanel({ callId, onCreateLead, onAddFollowUp }: CallTranscriptPanelProps) {
  const { data, loading } = useApiQuery<{ data: Transcript }>(
    () => voipApi.transcripts.getByCall(callId),
    [callId],
  );
  const transcript = data?.data ?? null;

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const segments = transcript?.speakerSegments ?? [];

  return (
    <div className="flex flex-col gap-ds-4">
      <CallSummaryCard callId={callId} />
      <SectionCard title="Call transcript">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : !transcript ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title="No transcript"
            description="No transcript is available for this call."
          />
        ) : (
          <div className="flex flex-col gap-ds-3">
            <div className="flex items-center gap-ds-2">
              {transcript.language && <Tag tone="neutral">{transcript.language}</Tag>}
              {transcript.durationSeconds ? <Tag tone="neutral">{formatClock(transcript.durationSeconds)}</Tag> : null}
              {transcript.isEdited && <Tag tone="info">Edited</Tag>}
              <Button
                variant="ghost"
                size="icon-sm"
                className="ms-auto"
                aria-label="Copy transcript"
                onClick={() => void handleCopyText(transcript.fullTranscript)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
            {segments.length > 0 ? (
              <ul className="flex max-h-96 flex-col gap-ds-3 overflow-y-auto" data-scroll-region="transcript">
                {segments.map((seg, idx) => (
                  <li key={idx} className="flex gap-ds-3">
                    <div className="flex shrink-0 flex-col items-end gap-ds-1">
                      <span className="font-mono text-xs text-ds-foreground-muted">{formatClock(seg.start)}</span>
                      <Tag tone="neutral">{seg.speaker}</Tag>
                    </div>
                    <p className="min-w-0 flex-1 break-words text-sm leading-relaxed text-ds-foreground">{seg.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="whitespace-pre-wrap rounded-ds-md bg-ds-surface-sunken p-ds-4 text-sm leading-relaxed">
                {transcript.fullTranscript}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {(onCreateLead || onAddFollowUp) && (
        <div className="grid grid-cols-2 gap-ds-3">
          {onCreateLead && (
            <Button onClick={onCreateLead} className="w-full gap-ds-2">
              <Plus aria-hidden="true" /> Create lead
            </Button>
          )}
          {onAddFollowUp && (
            <Button onClick={onAddFollowUp} variant="outline" className="w-full gap-ds-2">
              <Plus aria-hidden="true" /> Add follow-up
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
