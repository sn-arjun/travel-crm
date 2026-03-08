'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Phone, PhoneIncoming, PhoneOutgoing, Clock,
  Play, Pause, Download, FileText, User, Briefcase,
  Loader, AlertCircle, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type Call, type Transcript } from '@/lib/api/voip';

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function statusColor(status: string) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'no_answer': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
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
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-4">
      <Button variant="outline" size="icon" onClick={toggle} className="shrink-0">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <div className="flex-1 space-y-1">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatDuration(Math.floor((progress / 100) * duration))}</span>
          <span>{formatDuration(Math.floor(duration))}</span>
        </div>
      </div>
      <a href={src} download>
        <Button variant="ghost" size="icon-sm">
          <Download className="h-4 w-4" />
        </Button>
      </a>
    </div>
  );
}

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const callId = params.id as string;

  const { data: callResponse, loading: callLoading, error: callError } = useApiQuery<any>(
    () => voipApi.calls.getById(callId),
    [callId],
  );

  const { data: transcriptResponse } = useApiQuery<any>(
    () => voipApi.transcripts.getByCall(callId),
    [callId],
  );

  const call: Call | null = callResponse?.data ?? null;
  const transcript: Transcript | null = transcriptResponse?.data ?? null;

  if (callLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (callError || !call) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Failed to load call details</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const isInbound = call.direction === 'inbound';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Call Detail
            </h1>
            <p className="text-sm text-muted-foreground">
              {isInbound ? 'Inbound' : 'Outbound'} call - {new Date(call.startTime).toLocaleString('en-IN')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('border-transparent', statusColor(call.status))}>
            {call.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Call Info */}
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Call Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Direction</p>
                    <div className="flex items-center gap-2">
                      {isInbound ? (
                        <PhoneIncoming className="h-4 w-4 text-blue-500" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-green-500" />
                      )}
                      <span className="text-sm font-medium">{isInbound ? 'Inbound' : 'Outbound'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Badge variant="outline" className={cn('border-transparent', statusColor(call.status))}>
                      {call.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">From</p>
                    <p className="text-sm font-medium font-mono">{call.from}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">To</p>
                    <p className="text-sm font-medium font-mono">{call.to}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Duration</p>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{formatDuration(call.duration)}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Start Time</p>
                    <p className="text-sm">{new Date(call.startTime).toLocaleString('en-IN')}</p>
                  </div>
                  {call.endTime && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">End Time</p>
                      <p className="text-sm">{new Date(call.endTime).toLocaleString('en-IN')}</p>
                    </div>
                  )}
                </div>
                {call.notes && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Notes</p>
                      <p className="text-sm">{call.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Related Entities */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" /> Related Records
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {call.contactId ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Contact</p>
                        <p className="text-xs text-muted-foreground">{call.contactId}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/contacts/${call.contactId}`}>View</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed text-center">
                    <p className="text-sm text-muted-foreground">No contact linked</p>
                  </div>
                )}

                {call.leadId ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Briefcase className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Lead</p>
                        <p className="text-xs text-muted-foreground">{call.leadId}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/leads/${call.leadId}`}>View</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed text-center">
                    <p className="text-sm text-muted-foreground">No lead linked</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recording */}
          {call.recordingUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Volume2 className="h-4 w-4" /> Recording
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AudioPlayer src={call.recordingUrl} />
              </CardContent>
            </Card>
          )}

          {/* Transcript */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Transcript
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transcript ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-4">
                    {transcript.sentiment && (
                      <Badge variant="outline" className={cn(
                        'border-transparent',
                        transcript.sentiment === 'positive' && 'bg-green-100 text-green-700',
                        transcript.sentiment === 'neutral' && 'bg-gray-100 text-gray-700',
                        transcript.sentiment === 'negative' && 'bg-red-100 text-red-700',
                      )}>
                        Sentiment: {transcript.sentiment}
                      </Badge>
                    )}
                    {transcript.language && (
                      <Badge variant="outline">{transcript.language}</Badge>
                    )}
                  </div>
                  {transcript.keywords && transcript.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {transcript.keywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{kw}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed">
                    {transcript.text}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No transcript available for this call</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
