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
import { voipApi } from '@/lib/api/voip';

interface CallControlsPanelProps {
  callId: string;
  callerName: string;
  phoneNumber: string;
  onEndCall?: () => void;
  onCallStatusChange?: (status: CallStatus) => void;
}

type CallStatus = 'connecting' | 'connected' | 'on_hold' | 'ended';
type CallOutcome = 'connected' | 'no_answer' | 'busy' | 'voicemail';

export function CallControlsPanel({ callId, callerName, phoneNumber, onEndCall, onCallStatusChange }: CallControlsPanelProps) {
  const [status, setStatus] = React.useState<CallStatus>('connecting');
  const [isMuted, setIsMuted] = React.useState(false);
  const [isOnHold, setIsOnHold] = React.useState(false);
  const [callDuration, setCallDuration] = React.useState(0);
  const [showPostCallDialog, setShowPostCallDialog] = React.useState(false);
  const [callOutcome, setCallOutcome] = React.useState<CallOutcome>('connected');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Simulate call connection after 2 seconds
  React.useEffect(() => {
    if (status === 'connecting') {
      const timer = setTimeout(() => {
        setStatus('connected');
        onCallStatusChange?.('connected');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onCallStatusChange]);

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
    setStatus('ended');
    onCallStatusChange?.('ended');
    setShowPostCallDialog(true);
  };

  const handlePostCallSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Log call with outcome and notes
      // The API call would be made here to save call details
      // For now, we'll simulate the API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      toast.success(`Call logged: ${callOutcome}`, {
        description: notes ? `Notes: ${notes}` : undefined,
      });
      setShowPostCallDialog(false);
      onEndCall?.();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to log call';
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusConfig = {
    connecting: { label: 'Connecting...', color: 'bg-amber-100 text-amber-800' },
    connected: { label: 'Connected', color: 'bg-emerald-100 text-emerald-800' },
    on_hold: { label: 'On Hold', color: 'bg-blue-100 text-blue-800' },
    ended: { label: 'Call Ended', color: 'bg-gray-100 text-gray-800' },
  };

  const config = statusConfig[status];

  return (
    <>
      <Card className="fixed bottom-6 right-6 w-80 shadow-lg border-0 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
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
            <Button
              onClick={handleMuteToggle}
              size="lg"
              variant={isMuted ? 'destructive' : 'outline'}
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'connecting' || status === 'ended'}
            >
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              <span className="sr-only">{isMuted ? 'Unmute' : 'Mute'}</span>
            </Button>

            <Button
              onClick={handleHoldToggle}
              size="lg"
              variant={isOnHold ? 'secondary' : 'outline'}
              className="h-12 w-12 rounded-full p-0"
              disabled={status === 'connecting' || status === 'ended'}
            >
              {isOnHold ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              <span className="sr-only">{isOnHold ? 'Resume' : 'Hold'}</span>
            </Button>

            <Button
              onClick={handleEndCall}
              size="lg"
              className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 p-0"
              disabled={status === 'ended'}
            >
              <PhoneOff className="h-5 w-5" />
              <span className="sr-only">End call</span>
            </Button>
          </div>

          {/* AI Transcript hint */}
          <div className="flex items-center gap-2 rounded-lg bg-blue-50 p-2.5 dark:bg-blue-950/30">
            <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-xs text-blue-700 dark:text-blue-300">Call transcript will be available after the call ends</p>
          </div>
        </CardContent>
      </Card>

      {/* Post-Call Dialog */}
      <Dialog open={showPostCallDialog} onOpenChange={setShowPostCallDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Call Outcome</DialogTitle>
            <DialogDescription>Record how the call ended and add any notes for follow-up.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Call Outcome</label>
              <Select value={callOutcome} onValueChange={(value) => setCallOutcome(value as CallOutcome)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connected">Connected</SelectItem>
                  <SelectItem value="no_answer">No Answer</SelectItem>
                  <SelectItem value="busy">Busy</SelectItem>
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
              {isSubmitting ? 'Logging...' : 'Log & Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
