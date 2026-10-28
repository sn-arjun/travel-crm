'use client';

import * as React from 'react';
import { Download, Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui';
import { voipApi } from '@/lib/api/voip';

/** What the agent is told when the recording cannot be played. */
export function recordingErrorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403) return 'You do not have access to this recording.';
  if (status === 409) return 'This recording is still being saved. Try again in a few minutes.';
  if (status === 410) return 'This recording was deleted after the retention period.';
  if (status === 404) return 'There is no recording for this call.';
  return 'The recording could not be loaded.';
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Loads a call's recording on demand: asks for the short-lived signed link, then fetches the audio with the user's own
 * login and plays it from memory. Nothing is fetched until `load()` is called, so a page full of calls costs nothing.
 */
export function useCallRecording(callId: string) {
  const [state, setState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [src, setSrc] = React.useState<string | null>(null);
  const objectUrl = React.useRef<string | null>(null);

  React.useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const load = React.useCallback(async (): Promise<string | null> => {
    if (objectUrl.current) return objectUrl.current;
    setState('loading');
    try {
      const link = (await voipApi.calls.recording(callId)).data;
      const blob = await voipApi.calls.recordingAudio(link);
      const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: link.contentType || 'audio/mpeg' }));
      objectUrl.current = url;
      setSrc(url);
      setState('ready');
      return url;
    } catch (error) {
      setState('error');
      toast.error(recordingErrorMessage(error));
      return null;
    }
  }, [callId]);

  return { state, src, load };
}

/** The small Play button on a timeline entry: fetches on the first click, then plays and pauses. */
export function RecordingPlayButton({ callId }: { callId: string }) {
  const { state, load } = useCallRecording(callId);
  const audio = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const toggle = async () => {
    if (!audio.current) {
      const url = await load();
      if (!url) return;
      const element = new Audio(url);
      element.addEventListener('ended', () => setPlaying(false));
      element.addEventListener('pause', () => setPlaying(false));
      element.addEventListener('play', () => setPlaying(true));
      audio.current = element;
    }
    if (audio.current.paused) await audio.current.play().catch(() => toast.error('The recording could not be played.'));
    else audio.current.pause();
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void toggle()}
      disabled={state === 'loading'}
      aria-label={playing ? 'Pause recording' : 'Play recording'}
      data-testid="call-entry-play"
    >
      {state === 'loading' ? <Loader2 className="animate-spin" aria-hidden="true" /> : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}{' '}
      {playing ? 'Pause' : 'Play'}
    </Button>
  );
}

/** The player on the call page: a progress bar, play and pause, and a download of the stored audio. */
export function CallRecordingPlayer({ callId, fileName }: { callId: string; fileName?: string }) {
  const { state, src, load } = useCallRecording(callId);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const audio = React.useRef<HTMLAudioElement | null>(null);

  React.useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  const attach = (url: string): HTMLAudioElement => {
    const element = new Audio(url);
    element.addEventListener('loadedmetadata', () => setDuration(element.duration));
    element.addEventListener('timeupdate', () => {
      if (element.duration) setProgress((element.currentTime / element.duration) * 100);
    });
    element.addEventListener('ended', () => {
      setPlaying(false);
      setProgress(0);
    });
    element.addEventListener('pause', () => setPlaying(false));
    element.addEventListener('play', () => setPlaying(true));
    audio.current = element;
    return element;
  };

  const toggle = async () => {
    let element = audio.current;
    if (!element) {
      const url = await load();
      if (!url) return;
      element = attach(url);
    }
    if (element.paused) await element.play().catch(() => toast.error('The recording could not be played.'));
    else element.pause();
  };

  return (
    <div className="flex items-center gap-ds-3 rounded-ds-md bg-ds-surface-sunken p-ds-4" data-testid="call-recording-player">
      <Button
        variant="outline"
        size="icon"
        onClick={() => void toggle()}
        disabled={state === 'loading'}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        className="shrink-0"
      >
        {state === 'loading' ? <Loader2 className="size-4 animate-spin" /> : playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="flex-1 space-y-ds-1">
        <div className="h-2 overflow-hidden rounded-ds-full bg-ds-surface">
          <div className="h-full rounded-ds-full bg-ds-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-ds-foreground-muted">
          <span>{formatClock((progress / 100) * duration)}</span>
          <span>{duration ? formatClock(duration) : state === 'idle' ? 'Press play to load' : ''}</span>
        </div>
      </div>
      {src && (
        <a href={src} download={fileName ?? `call-${callId}.mp3`}>
          <Button variant="ghost" size="icon-sm" aria-label="Download recording">
            <Download className="size-4" />
          </Button>
        </a>
      )}
    </div>
  );
}
