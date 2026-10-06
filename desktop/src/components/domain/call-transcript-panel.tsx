'use client';

import * as React from 'react';
import { Copy, FileText, Plus } from 'lucide-react';
import { Button, EmptyState, Skeleton, Tag, SectionCard } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type Transcript } from '@/lib/api/voip';
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
                className="ml-auto"
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
