'use client';

import * as React from 'react';
import Link from 'next/link';
import { Mic, MicOff, Pause, Play, PhoneOff, Sparkles, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { voipApi, type CallOutcome, type RecordingSettings } from '@/lib/api/voip';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useSoftphone } from '@/lib/softphone/use-softphone';
import { useT } from '@/lib/i18n';
import { Checkbox } from '@/components/ui/checkbox';

interface CallControlsPanelProps {
  callId: string;
  callerName: string;
  phoneNumber: string;
  onEndCall?: () => void;
  onCallStatusChange?: (status: CallStatus) => void;
  /** Mute and hold are shown when the call's audio is in this app (the softphone); a bridged call is handled on the agent's phone, so they are hidden. */
  supportsMuteHold?: boolean;
  /** The lead this call belongs to: the panel links to it. */
  leadId?: string | null;
  leadTitle?: string | null;
  /** Who started it. An inbound call the agent answered in the app is connected as soon as the audio is. */
  direction?: 'inbound' | 'outbound';
  /** The call's audio runs through the in-app softphone: mute, hold and hang up act on it, and the panel closes when it ends. */
  viaSoftphone?: boolean;
}

/** For agencies that record on request: a tick that says the caller agreed, which starts the recording. */
function RecordingConsentTick({ callId, active }: { callId: string; active: boolean }) {
  const t = useT();
  const [settings, setSettings] = React.useState<RecordingSettings | null>(null);
  const [given, setGiven] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    voipApi.recordingSettings.get().then((r) => { if (!cancelled) setSettings(r.data); }).catch(() => { /* no tick without the setting */ });
    return () => { cancelled = true; };
  }, []);

  if (!settings || settings.consentMode !== 'on_request') return null;

  const tick = async (checked: boolean) => {
    if (!checked || given) return;
    setBusy(true);
    try {
      await voipApi.calls.recordingConsent(callId);
      setGiven(true);
      toast.success(t('softphone.panel.recordingStarted'));
    } catch (error) {
      toast.error((error as { message?: string } | null)?.message || t('softphone.panel.recordingFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="flex items-start gap-ds-2 rounded-ds-md bg-ds-surface-sunken p-ds-2 text-xs" data-testid="call-panel-consent">
      <Checkbox
        checked={given}
        disabled={busy || given || !active}
        onCheckedChange={(v) => void tick(v === true)}
        aria-label={t('softphone.panel.consent')}
        data-testid="call-panel-consent-tick"
      />
      <span>
        <span className="font-medium text-ds-foreground">{t('softphone.panel.consent')}</span>
        {settings.effectiveAnnouncement && <span className="mt-ds-1 block text-ds-foreground-muted">{settings.effectiveAnnouncement}</span>}
      </span>
    </label>
  );
}

type CallStatus = 'connecting' | 'connected' | 'on_hold' | 'ended';

export function CallControlsPanel({ callId, callerName, phoneNumber, onEndCall, onCallStatusChange, supportsMuteHold = false, leadId, leadTitle, direction = 'outbound', viaSoftphone = false }: CallControlsPanelProps) {
  const t = useT();
  const softphone = useSoftphone();
  const [status, setStatus] = React.useState<CallStatus>('connecting');
  const [isMuted, setIsMuted] = React.useState(false);
  const [isOnHold, setIsOnHold] = React.useState(false);
  const [callDuration, setCallDuration] = React.useState(0);
  const [showPostCallDialog, setShowPostCallDialog] = React.useState(false);
  const [callOutcome, setCallOutcome] = React.useState<CallOutcome>('interested');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // The provider's real call state arrives over the realtime room (call:status); the poll below is the fallback.
  const subscribe = useRealtimeStore((s) => s.subscribe);
  const statusRef = React.useRef(status);
  statusRef.current = status;
  React.useEffect(() => {
    return subscribe('call:status', (data) => {
      const event = data as { callId?: string; status?: string };
      if (event.callId !== callId || !event.status) return;
      const current = statusRef.current;
      if (event.status === 'in-progress' && current === 'connecting') {
        setStatus('connected');
        onCallStatusChange?.('connected');
      } else if (['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(event.status) && current !== 'ended') {
        setStatus('ended');
        onCallStatusChange?.('ended');
        setShowPostCallDialog(true);
      }
    });
  }, [subscribe, callId, onCallStatusChange]);

  // The softphone's own view of the call (R307): its audio connects the agent; a call the agent answered is live from then on.
  const softphoneLive = softphone.status === 'in_call' || softphone.status === 'connecting';
  const wasLive = React.useRef(false);
  React.useEffect(() => {
    if (!viaSoftphone) return;
    if (softphoneLive) wasLive.current = true;
    if (direction === 'inbound' && softphone.status === 'in_call' && statusRef.current === 'connecting') {
      setStatus('connected');
      onCallStatusChange?.('connected');
    }
    if (wasLive.current && !softphoneLive && statusRef.current !== 'ended') {
      // The audio ended (the other side hung up, or the connection dropped): the call is over.
      wasLive.current = false;
      setStatus('ended');
      onCallStatusChange?.('ended');
      setShowPostCallDialog(true);
    }
  }, [viaSoftphone, softphoneLive, softphone.status, direction, onCallStatusChange]);

  // Follow the real call state from the provider instead of assuming it connected.
  React.useEffect(() => {
    if (status !== 'connecting') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await voipApi.calls.getById(callId);
        const callStatus = res.data?.status;
        if (cancelled) return;
        if (callStatus === 'in-progress') {
          setStatus('connected');
          onCallStatusChange?.('connected');
        } else if (callStatus && ['completed', 'busy', 'no-answer', 'canceled', 'failed'].includes(callStatus)) {
          setStatus('ended');
          onCallStatusChange?.('ended');
          setShowPostCallDialog(true);
        }
      } catch {
        // keep waiting; the next poll retries
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, callId, onCallStatusChange]);

  // Call duration timer
  React.useEffect(() => {
    if (status !== 'connected' && status !== 'on_hold') {
      return;
    }

    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMuteToggle = () => {
    if (viaSoftphone) softphone.setMuted(!isMuted);
    setIsMuted(!isMuted);
    toast.success(isMuted ? 'Microphone on' : 'Microphone muted');
  };

  const handleHoldToggle = () => {
    if (viaSoftphone) softphone.setHeld(!isOnHold);
    setIsOnHold(!isOnHold);
    const newStatus = isOnHold ? 'connected' : 'on_hold';
    setStatus(newStatus);
    onCallStatusChange?.(newStatus);
    toast.success(isOnHold ? 'Call resumed' : 'Call held');
  };

  const handleEndCall = async () => {
    if (viaSoftphone) {
      // The audio leg is closed here; the provider ends the other leg, and the API is told as well.
      wasLive.current = false;
      softphone.hangup();
      try { await voipApi.calls.end(callId); } catch { /* the provider already ended it */ }
      setStatus('ended');
      onCallStatusChange?.('ended');
      setShowPostCallDialog(true);
      return;
    }
    try {
      await voipApi.calls.end(callId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to end the call');
      return;
    }
    setStatus('ended');
    onCallStatusChange?.('ended');
    setShowPostCallDialog(true);
  };

  const handlePostCallSubmit = async () => {
    setIsSubmitting(true);
    try {
      await voipApi.calls.update(callId, { outcome: callOutcome, notes: notes.trim() || undefined });
      toast.success('Call logged');
      setShowPostCallDialog(false);
      onEndCall?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to log call');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusConfig = {
    connecting: { label: 'Connecting...', color: 'bg-ds-warning-subtle text-ds-warning-on-subtle' },
    connected: { label: 'Connected', color: 'bg-ds-success-subtle text-ds-success-on-subtle' },
    on_hold: { label: 'On hold', color: 'bg-ds-info-subtle text-ds-info-on-subtle' },
    ended: { label: 'Call ended', color: 'bg-ds-surface-sunken text-ds-foreground-muted' },
  };

  const config = statusConfig[status];
  // Mute and hold act on the audio, which is in this app when the softphone carries the call.
  const showMuteHold = supportsMuteHold || (viaSoftphone && softphone.status === 'in_call');

  return (
    <>
      <Card className="fixed bottom-6 right-6 w-80 shadow-lg border-0 bg-ds-surface-raised" data-testid="call-panel" data-call-status={status}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <CardTitle className="text-base">{callerName}</CardTitle>
              <p className="text-sm text-muted-foreground">{phoneNumber}</p>
            </div>
            <Badge className={cn('ml-auto', config.color)}>{config.label}</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Call Duration */}
          {status !== 'connecting' && (
            <div className="flex items-center justify-center rounded-lg bg-muted/50 py-3">
              <span className="text-2xl font-mono font-bold text-foreground" data-testid="call-panel-timer">{formatDuration(callDuration)}</span>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-3">
            {showMuteHold && <Button
              onClick={handleMuteToggle}
              data-testid="call-panel-mute"
              size="lg"
              variant={isMuted ? 'destructive' : 'outline'}
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'connecting' || status === 'ended'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>}

            {showMuteHold && <Button
              onClick={handleHoldToggle}
              data-testid="call-panel-hold"
              size="lg"
              variant={isOnHold ? 'secondary' : 'outline'}
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'connecting' || status === 'ended'}
              aria-label={isOnHold ? 'Resume' : 'Hold'}
            >
              {isOnHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </Button>}

            <Button
              onClick={handleEndCall}
              data-testid="call-panel-hangup"
              size="lg"
              variant="destructive"
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'ended'}
              aria-label="End call"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
          </div>

          {leadId && (
            <Link
              href={`/leads/${leadId}`}
              className="flex items-center gap-ds-2 rounded-ds-md border border-ds-border px-ds-3 py-ds-2 text-sm text-ds-foreground hover:bg-ds-surface-sunken"
              data-testid="call-panel-lead"
            >
              <ExternalLink className="size-4 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{leadTitle || t('softphone.panel.openLead')}</span>
            </Link>
          )}

          {status !== 'ended' && (
            <div className="space-y-ds-1">
              <label htmlFor={`call-note-${callId}`} className="text-xs font-medium text-ds-foreground-muted">{t('softphone.panel.note')}</label>
              <Textarea
                id={`call-note-${callId}`}
                data-testid="call-panel-note"
                placeholder={t('softphone.panel.notePlaceholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-16 text-sm"
              />
            </div>
          )}

          {status !== 'ended' && <RecordingConsentTick callId={callId} active={status === 'connected' || status === 'on_hold'} />}

          {/* Transcript hint */}
          <div className="flex items-center gap-2 rounded-lg bg-ds-info-subtle p-2.5">
            <Sparkles className="h-4 w-4 text-ds-info-on-subtle flex-shrink-0" />
            <p className="text-xs text-ds-info-on-subtle">Call transcript will be available after the call ends</p>
          </div>
        </CardContent>
      </Card>

      {/* Post-Call Dialog */}
      <Dialog open={showPostCallDialog} onOpenChange={(open) => { setShowPostCallDialog(open); if (!open && statusRef.current === 'ended') onEndCall?.(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log call outcome</DialogTitle>
            <DialogDescription>Record how the call ended and add any notes for follow-up.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Call outcome</label>
              <Select value={callOutcome} onValueChange={(value) => setCallOutcome(value as CallOutcome)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not interested</SelectItem>
                  <SelectItem value="follow_up_needed">Follow-up needed</SelectItem>
                  <SelectItem value="wrong_number">Wrong number</SelectItem>
                  <SelectItem value="no_answer">No answer</SelectItem>
                  <SelectItem value="voicemail">Voicemail</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                placeholder="Add any notes about the call..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPostCallDialog(false); onEndCall?.(); }} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handlePostCallSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Logging...' : 'Log & close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
