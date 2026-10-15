'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Download, FileText, PhoneForwarded, PhoneOff, Play, Pause, Trash2, User, Briefcase,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { Button, Tag, SectionCard, Skeleton, Input, EmptyState } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { voipApi, type Call, type Transcript } from '@/lib/api/voip';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function statusTone(status: Call['status']): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'no-answer' || status === 'failed' || status === 'busy' || status === 'canceled') return 'danger';
  if (status === 'in-progress' || status === 'ringing') return 'info';
  return 'neutral';
}

function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    });
    audio.addEventListener('ended', () => {
      setPlaying(false);
      setProgress(0);
    });
    return () => {
      audio.pause();
      audio.remove();
    };
  }, [src]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else void audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-ds-3 rounded-ds-md bg-ds-surface-sunken p-ds-4">
      <Button variant="outline" size="icon" onClick={toggle} className="shrink-0">
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="flex-1 space-y-ds-1">
        <div className="h-2 overflow-hidden rounded-ds-full bg-ds-surface">
          <div className="h-full rounded-ds-full bg-ds-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-ds-foreground-muted">
          <span>{formatDuration(Math.floor((progress / 100) * duration))}</span>
          <span>{formatDuration(Math.floor(duration))}</span>
        </div>
      </div>
      <a href={src} download>
        <Button variant="ghost" size="icon-sm" aria-label="Download recording">
          <Download className="size-4" />
        </Button>
      </a>
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params.id as string;
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [transferTo, setTransferTo] = React.useState('');
  const [transferring, setTransferring] = React.useState(false);

  const { data: callResponse, loading: callLoading, error: callError, refetch } = useApiQuery<{ data: Call }>(
    () => voipApi.calls.getById(callId),
    [callId],
  );
  const { data: transcriptResponse } = useApiQuery<{ data: Transcript }>(
    () => voipApi.transcripts.getByCall(callId),
    [callId],
  );

  const { mutate: endCall, loading: ending } = useApiMutation<void, { data: { message: string } }>(() => voipApi.calls.end(callId));
  const { mutate: deleteCall } = useApiMutation<void, unknown>(() => voipApi.calls.remove(callId));

  const call = callResponse?.data ?? null;
  const transcript = transcriptResponse?.data ?? null;

  if (gateLoading) return <Skeleton className="h-9 w-32" />;

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-9 text-center">
        <PhoneOff className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">
          {reason === 'country_unavailable'
            ? 'Calling is not available for agencies in your country yet.'
            : reason === 'cap_exceeded' ? 'Call limit reached for your plan.' : 'VoIP calling is not enabled on your plan.'}
        </p>
        {reason !== 'country_unavailable' && (
          <Button asChild size="sm">
            <a href={upgradeHref}>Upgrade to enable</a>
          </Button>
        )}
      </div>
    );
  }

  if (callLoading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (callError || !call) {
    return (
      <EmptyState
        title="Call not found"
        description="This call log could not be loaded."
        action={<Button variant="outline" onClick={() => router.back()}>Go back</Button>}
      />
    );
  }

  const isInbound = call.direction === 'inbound';

  async function handleEnd() {
    const result = await endCall(undefined);
    if (result) {
      toast.success('Call ended');
      refetch();
    } else {
      toast.error('Failed to end call');
    }
  }

  async function handleTransfer() {
    if (!transferTo.trim()) return;
    setTransferring(true);
    const result = await voipApi.calls.transfer(callId, { targetNumber: transferTo.trim() }).catch(() => null);
    setTransferring(false);
    if (result) {
      toast.success(`Transferred to ${transferTo}`);
      setTransferTo('');
      refetch();
    } else {
      toast.error('Failed to transfer call');
    }
  }

  async function handleDelete() {
    const result = await deleteCall(undefined);
    if (result !== undefined) {
      toast.success('Call log deleted');
      router.push('/communication/calls');
    } else {
      toast.error('Failed to delete call log');
    }
  }

  return (
    <DetailPage<Call>
      entity={call}
      title={`${isInbound ? 'Inbound' : 'Outbound'} call`}
      subtitle={new Date(call.createdAt).toLocaleString('en-IN')}
      status={<Tag tone={statusTone(call.status)}>{call.status.replace('-', ' ')}</Tag>}
      onBack={() => router.back()}
      primaryActions={
        (call.status === 'in-progress' || call.status === 'ringing') ? (
          <Button variant="outline" size="sm" onClick={handleEnd} disabled={ending} className="gap-ds-2">
            <PhoneOff aria-hidden="true" /> End call
          </Button>
        ) : undefined
      }
      actions={[
        { label: 'Delete', icon: <Trash2 />, onSelect: handleDelete, destructive: true, separatorBefore: true },
      ]}
      messaging={
        call.contactId
          ? { recipientId: call.contactId, recipientName: call.contactName ?? (isInbound ? call.fromNumber : call.toNumber), phone: isInbound ? call.fromNumber : call.toNumber }
          : undefined
      }
      overview={
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <SectionCard title="Call information">
            <div className="grid grid-cols-2 gap-ds-4">
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">Direction</p>
                <p className="text-sm font-medium">{isInbound ? 'Inbound' : 'Outbound'}</p>
              </div>
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">Status</p>
                <Tag tone={statusTone(call.status)}>{call.status.replace('-', ' ')}</Tag>
              </div>
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">From</p>
                <p className="font-mono text-sm font-medium">{call.fromNumber}</p>
              </div>
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">To</p>
                <p className="font-mono text-sm font-medium">{call.toNumber}</p>
              </div>
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">Duration</p>
                <p className="text-sm font-medium">{formatDuration(call.durationSeconds)}</p>
              </div>
              <div>
                <p className="mb-ds-1 text-xs text-ds-foreground-muted">Start time</p>
                <p className="text-sm">{new Date(call.createdAt).toLocaleString('en-IN')}</p>
              </div>
            </div>
            {call.notes && (
              <p className="mt-ds-4 border-t border-ds-border pt-ds-4 text-sm">{call.notes}</p>
            )}
          </SectionCard>

          {(call.status === 'in-progress' || call.status === 'ringing') && (
            <SectionCard title="Transfer call">
              <div className="flex items-end gap-ds-2">
                <Input
                  placeholder="Transfer to number"
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleTransfer} disabled={transferring || !transferTo.trim()} className="gap-ds-2">
                  <PhoneForwarded aria-hidden="true" /> Transfer
                </Button>
              </div>
            </SectionCard>
          )}

          {call.recordingUrl && (
            <SectionCard title="Recording">
              <AudioPlayer src={call.recordingUrl} />
            </SectionCard>
          )}

          <SectionCard title="Transcript">
            {transcript ? (
              <div className="flex flex-col gap-ds-3">
                <div className="flex items-center gap-ds-2">
                  {transcript.language && <Tag tone="neutral">{transcript.language}</Tag>}
                  {transcript.isEdited && <Tag tone="info">Edited{transcript.editedByName ? ` by ${transcript.editedByName}` : ''}</Tag>}
                </div>
                <div className="rounded-ds-md bg-ds-surface-sunken p-ds-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {transcript.fullTranscript}
                </div>
              </div>
            ) : (
              <EmptyState icon={<FileText className="size-8" />} title="No transcript" description="No transcript available for this call." />
            )}
          </SectionCard>
        </div>
      }
      related={[
        {
          title: 'Related records',
          content: (
            <div className="grid gap-ds-3 sm:grid-cols-2">
              {call.contactId ? (
                <div className="flex items-center justify-between rounded-ds-md border border-ds-border p-ds-3">
                  <div className="flex items-center gap-ds-3">
                    <div className="flex size-9 items-center justify-center rounded-ds-full bg-ds-info-subtle">
                      <User className="size-4 text-ds-info-on-subtle" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Contact</p>
                      <p className="text-xs text-ds-foreground-muted">{call.contactName ?? call.contactId}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/contacts/${call.contactId}`)}>View</Button>
                </div>
              ) : (
                <div className="rounded-ds-md border border-dashed border-ds-border p-ds-3 text-center text-sm text-ds-foreground-muted">
                  No contact linked
                </div>
              )}
              {call.leadId ? (
                <div className="flex items-center justify-between rounded-ds-md border border-ds-border p-ds-3">
                  <div className="flex items-center gap-ds-3">
                    <div className="flex size-9 items-center justify-center rounded-ds-full bg-ds-primary-subtle">
                      <Briefcase className="size-4 text-ds-primary-on-subtle" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Lead</p>
                      <p className="text-xs text-ds-foreground-muted">{call.leadTitle ?? call.leadId}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push(`/leads/${call.leadId}`)}>View</Button>
                </div>
              ) : (
                <div className="rounded-ds-md border border-dashed border-ds-border p-ds-3 text-center text-sm text-ds-foreground-muted">
                  No lead linked
                </div>
              )}
            </div>
          ),
        },
      ]}
    />
  );
}
