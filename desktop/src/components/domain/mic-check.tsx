'use client';

import * as React from 'react';
import { Mic, Volume2, Wifi } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/api/config';
import { useT } from '@/lib/i18n';
import { useSoftphone } from '@/lib/softphone/use-softphone';
import { useSoftphoneStore } from '@/stores/softphone-store';

export type MicState = 'idle' | 'requesting' | 'listening' | 'denied' | 'no_device' | 'unsupported';
export type NetworkQuality = 'good' | 'fair' | 'poor' | 'unknown';

/** Turn round-trip times (ms) into a verdict a person can act on: the average delay and the spread between pings. */
export function rateConnection(samples: number[]): { quality: NetworkQuality; averageMs: number | null } {
  const ok = samples.filter((n) => Number.isFinite(n) && n >= 0);
  if (ok.length < 2) return { quality: 'unknown', averageMs: null };
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  const jitter = ok.reduce((a, b) => a + Math.abs(b - avg), 0) / ok.length;
  const quality: NetworkQuality = avg < 150 && jitter < 40 ? 'good' : avg < 300 && jitter < 100 ? 'fair' : 'poor';
  return { quality, averageMs: Math.round(avg) };
}

async function measureRoundTrips(count = 5): Promise<number[]> {
  const samples: number[] = [];
  for (let i = 0; i < count; i++) {
    const started = performance.now();
    try {
      const res = await fetch(`${getApiBaseUrl()}/health`, { cache: 'no-store' });
      if (res.ok || res.status === 503) samples.push(performance.now() - started);
    } catch {
      // a failed ping is simply not a sample
    }
  }
  return samples;
}

/** First-call check: microphone permission and level, speakers, and the connection to the server. */
export function MicCheck({ onComplete }: { onComplete?: () => void }) {
  const t = useT();
  const [state, setState] = React.useState<MicState>('idle');
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState('');
  const [level, setLevel] = React.useState(0);
  const [heard, setHeard] = React.useState(false);
  const [network, setNetwork] = React.useState<{ quality: NetworkQuality; averageMs: number | null } | null>(null);
  const [testingNetwork, setTestingNetwork] = React.useState(false);
  const stopRef = React.useRef<(() => void) | null>(null);

  const stop = React.useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);
  React.useEffect(() => stop, [stop]);

  const start = React.useCallback(async (selected?: string) => {
    stop();
    setHeard(false);
    setLevel(0);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: selected ? { deviceId: { exact: selected } } : true });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      setState(name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_device' : 'denied');
      return;
    }
    // Labels of the devices are only given after permission.
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === 'audioinput'));
      setDeviceId(stream.getAudioTracks()[0]?.getSettings?.().deviceId ?? selected ?? '');
    } catch {
      // the list is a convenience
    }

    const AudioCtx: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    let ctx: AudioContext | null = null;
    let raf = 0;
    if (AudioCtx) {
      ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        const value = Math.min(1, peak / 64);
        setLevel(value);
        if (value > 0.08) setHeard(true);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    setState('listening');
    stopRef.current = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((track) => track.stop());
      void ctx?.close().catch(() => undefined);
    };
  }, [stop]);

  const playTone = React.useCallback(() => {
    const AudioCtx: typeof AudioContext | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
    osc.onended = () => void ctx.close().catch(() => undefined);
  }, []);

  const testNetwork = React.useCallback(async () => {
    setTestingNetwork(true);
    setNetwork(rateConnection(await measureRoundTrips()));
    setTestingNetwork(false);
  }, []);

  const problem =
    state === 'denied' ? t('softphone.micCheck.denied')
    : state === 'no_device' ? t('softphone.micCheck.noDevice')
    : state === 'unsupported' ? t('softphone.micCheck.unsupported')
    : null;

  return (
    <div className="flex flex-col gap-ds-4" data-testid="mic-check" data-mic-state={state}>
      <div className="flex flex-col gap-ds-2">
        <div className="flex items-center gap-ds-2 text-sm font-medium"><Mic className="size-4" aria-hidden="true" />{t('softphone.micCheck.microphone')}</div>
        {state === 'idle' || problem || state === 'requesting' ? (
          <Button size="sm" className="self-start" onClick={() => void start()} disabled={state === 'requesting'} data-testid="mic-check-start">
            {state === 'requesting' ? t('softphone.micCheck.requesting') : t('softphone.micCheck.start')}
          </Button>
        ) : null}
        {problem && <p className="text-sm text-ds-danger-on-subtle" role="alert" data-testid="mic-check-problem">{problem}</p>}
        {state === 'listening' && (
          <>
            {devices.length > 1 && (
              <select
                className="h-9 rounded-ds-md border border-ds-border bg-ds-surface px-ds-2 text-sm"
                value={deviceId}
                aria-label={t('softphone.micCheck.microphone')}
                onChange={(e) => { setDeviceId(e.target.value); void start(e.target.value); }}
              >
                {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `${t('softphone.micCheck.microphone')} ${i + 1}`}</option>)}
              </select>
            )}
            <div
              className="h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken"
              role="meter"
              aria-label={t('softphone.micCheck.level')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              data-testid="mic-check-level"
            >
              <div className="h-full bg-ds-success transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
            </div>
            <p className="text-xs text-ds-foreground-muted" data-testid="mic-check-heard">
              {heard ? t('softphone.micCheck.heard') : t('softphone.micCheck.speak')}
            </p>
          </>
        )}
      </div>

      <div className="flex flex-col gap-ds-2">
        <div className="flex items-center gap-ds-2 text-sm font-medium"><Volume2 className="size-4" aria-hidden="true" />{t('softphone.micCheck.speakers')}</div>
        <Button size="sm" variant="outline" className="self-start" onClick={playTone} data-testid="mic-check-tone">{t('softphone.micCheck.playTone')}</Button>
      </div>

      <div className="flex flex-col gap-ds-2">
        <div className="flex items-center gap-ds-2 text-sm font-medium"><Wifi className="size-4" aria-hidden="true" />{t('softphone.micCheck.network')}</div>
        <Button size="sm" variant="outline" className="self-start" onClick={() => void testNetwork()} disabled={testingNetwork} data-testid="mic-check-network">
          {testingNetwork ? t('softphone.micCheck.testing') : network ? t('softphone.micCheck.runAgain') : t('softphone.micCheck.start')}
        </Button>
        {network && (
          <p className="text-sm" data-testid="mic-check-quality" data-quality={network.quality}>
            {t(`softphone.micCheck.quality.${network.quality}`)}
            {network.averageMs !== null && <span className="text-ds-foreground-muted"> ({t('softphone.micCheck.latency', { ms: network.averageMs })})</span>}
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => { stop(); onComplete?.(); }} data-testid="mic-check-done">{t('softphone.micCheck.done')}</Button>
      </div>
    </div>
  );
}

/** The check in a dialog. `open` is controlled by the dial page; the first-time prompt is `FirstCallMicCheck`. */
export function MicCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const setMicChecked = useSoftphoneStore((s) => s.setMicChecked);
  const finish = () => {
    setMicChecked(true);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) setMicChecked(true); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('softphone.micCheck.title')}</DialogTitle>
          <DialogDescription>{t('softphone.micCheck.description')}</DialogDescription>
        </DialogHeader>
        {open && <MicCheck onComplete={finish} />}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={finish} data-testid="mic-check-skip">{t('softphone.micCheck.skip')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shown once per computer, the first time the phone is ready in the app. The mock phone of local stacks has no
 * microphone, so it never asks.
 */
export function FirstCallMicCheck() {
  const softphone = useSoftphone();
  const micChecked = useSoftphoneStore((s) => s.micChecked);
  const [open, setOpen] = React.useState(false);
  const real = softphone.controller.getSoftphone()?.kind === 'twilio';
  React.useEffect(() => {
    if (softphone.status === 'ready' && real && !micChecked) setOpen(true);
  }, [softphone.status, real, micChecked]);
  if (!real || micChecked) return null;
  return <MicCheckDialog open={open} onOpenChange={setOpen} />;
}
