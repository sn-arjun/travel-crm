'use client';

import * as React from 'react';
import { Mic, MicOff, Pause, Play, PhoneOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { voipApi, type CallOutcome } from '@/lib/api/voip';
import { useRealtimeStore } from '@/stores/realtime-store';

interface CallControlsPanelProps {
  callId: string;
  callerName: string;
  phoneNumber: string;
  onEndCall?: () => void;
  onCallStatusChange?: (status: CallStatus) => void;
  /** Mute and hold are shown only when the provider can really do them; today none can, so they are hidden. */
  supportsMuteHold?: boolean;
}

type CallStatus = 'connecting' | 'connected' | 'on_hold' | 'ended';

export function CallControlsPanel({ callId, callerName, phoneNumber, onEndCall, onCallStatusChange, supportsMuteHold = false }: CallControlsPanelProps) {
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
    setIsMuted(!isMuted);
    toast.success(isMuted ? 'Microphone on' : 'Microphone muted');
  };

  const handleHoldToggle = () => {
    setIsOnHold(!isOnHold);
    const newStatus = isOnHold ? 'connected' : 'on_hold';
    setStatus(newStatus);
    onCallStatusChange?.(newStatus);
    toast.success(isOnHold ? 'Call resumed' : 'Call held');
  };

  const handleEndCall = async () => {
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

  return (
    <>
      <Card className="fixed bottom-6 right-6 w-80 shadow-lg border-0 bg-ds-surface-raised">
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
              <span className="text-2xl font-mono font-bold text-foreground">{formatDuration(callDuration)}</span>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-3">
            {supportsMuteHold && <Button
              onClick={handleMuteToggle}
              size="lg"
              variant={isMuted ? 'destructive' : 'outline'}
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'connecting' || status === 'ended'}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>}

            {supportsMuteHold && <Button
              onClick={handleHoldToggle}
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
              size="lg"
              variant="destructive"
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'ended'}
              aria-label="End call"
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
          </div>

          {/* Transcript hint */}
          <div className="flex items-center gap-2 rounded-lg bg-ds-info-subtle p-2.5">
            <Sparkles className="h-4 w-4 text-ds-info-on-subtle flex-shrink-0" />
            <p className="text-xs text-ds-info-on-subtle">Call transcript will be available after the call ends</p>
          </div>
        </CardContent>
      </Card>

      {/* Post-Call Dialog */}
      <Dialog open={showPostCallDialog} onOpenChange={setShowPostCallDialog}>
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
            <Button variant="outline" onClick={() => setShowPostCallDialog(false)} disabled={isSubmitting}>
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
