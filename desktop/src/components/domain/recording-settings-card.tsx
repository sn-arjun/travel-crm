'use client';

import * as React from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Input,
  Label,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  Switch,
  Tag,
  Textarea,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type RecordingConsentMode, type RecordingSettings } from '@/lib/api/voip';

const MODES: { value: RecordingConsentMode; label: string; help: string }[] = [
  { value: 'announce', label: 'Announce and record', help: 'Callers hear the announcement, then the call is recorded.' },
  { value: 'on_request', label: 'Record on request', help: 'Nothing is recorded unless the agent confirms the caller agreed and starts recording.' },
  { value: 'off', label: 'Do not record', help: 'Calls are never recorded. Voicemail messages are still kept.' },
];

/**
 * Recording consent, retention and Call AI for the agency. Recording and the AI both default to the safe choice: the
 * announcement is on, and Call AI is off until an administrator switches it on (it uses AI credits).
 */
export function RecordingSettingsCard() {
  const { data, loading, refetch } = useApiQuery<{ data: RecordingSettings }>(() => voipApi.recordingSettings.get(), []);
  const saved = data?.data ?? null;
  const [form, setForm] = React.useState({
    consentMode: 'announce' as RecordingConsentMode,
    announcement: '',
    retentionDays: 90,
    callAiEnabled: false,
    callAiEngine: 'standard' as 'standard' | 'premium',
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!saved) return;
    setForm({
      consentMode: saved.consentMode,
      announcement: saved.announcement ?? '',
      retentionDays: saved.retentionDays,
      callAiEnabled: saved.callAiEnabled,
      callAiEngine: saved.callAiEngine,
    });
  }, [saved]);

  const save = async () => {
    setSaving(true);
    try {
      await voipApi.recordingSettings.update({
        consentMode: form.consentMode,
        announcement: form.announcement.trim() ? form.announcement.trim() : null,
        retentionDays: form.retentionDays,
        callAiEnabled: form.callAiEnabled,
        callAiEngine: form.callAiEngine,
      });
      toast.success('Recording settings saved');
      refetch();
    } catch (error) {
      toast.error((error as { message?: string } | null)?.message || 'Could not save recording settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!saved) return null;

  const mode = MODES.find((m) => m.value === form.consentMode);
  const retentionValid = Number.isInteger(form.retentionDays) && form.retentionDays >= 1 && form.retentionDays <= 3650;

  return (
    <div data-testid="recording-settings">
      <SectionCard
        title="Recording and Call AI"
        description="What callers are told, how long recordings are kept, and whether calls are transcribed and summarised"
      >
        {!saved.configured ? (
          <p className="text-sm text-ds-foreground-muted">Save your calling settings first, then choose how calls are recorded.</p>
        ) : (
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-2">
              <Label>Call recording</Label>
              <Select value={form.consentMode} onValueChange={(v) => setForm((p) => ({ ...p, consentMode: v as RecordingConsentMode }))}>
                <SelectTrigger className="w-72" aria-label="Recording consent mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode && <p className="text-xs text-ds-foreground-muted">{mode.help}</p>}
            </div>

            {form.consentMode !== 'off' && (
              <div className="flex flex-col gap-ds-2">
                <Label htmlFor="recordingAnnouncement">Announcement</Label>
                <Textarea
                  id="recordingAnnouncement"
                  rows={2}
                  maxLength={300}
                  value={form.announcement}
                  placeholder={saved.defaultAnnouncement}
                  onChange={(e) => setForm((p) => ({ ...p, announcement: e.target.value }))}
                />
                <p className="text-xs text-ds-foreground-muted">
                  Played to callers before the agent is rung, and to the customer when they answer an outbound call. Leave empty to use the default wording. Rules about recording differ by country: check yours.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-ds-2">
              <Label htmlFor="recordingRetentionDays">Keep recordings and transcripts for (days)</Label>
              <Input
                id="recordingRetentionDays"
                type="number"
                min={1}
                max={3650}
                className="w-40"
                value={form.retentionDays}
                onChange={(e) => setForm((p) => ({ ...p, retentionDays: Number(e.target.value) }))}
              />
              <p className="text-xs text-ds-foreground-muted">After this the audio and transcript are deleted. The call record and the summary stay.</p>
            </div>

            <div className="flex items-center justify-between border-t border-ds-border pt-ds-4">
              <div>
                <p className="text-sm font-medium text-ds-foreground">Call AI</p>
                <p className="text-xs text-ds-foreground-muted">
                  Transcribe recorded calls and write a short summary with suggested next steps. Uses AI credits (3 per minute of audio, 5 per summary). Suggestions need your click.
                </p>
                {!saved.aiIncluded && <Tag tone="warning" className="mt-ds-1">AI is not included in your plan</Tag>}
              </div>
              <Switch
                aria-label="Call AI"
                checked={form.callAiEnabled}
                onCheckedChange={(v) => setForm((p) => ({ ...p, callAiEnabled: v }))}
              />
            </div>

            {form.callAiEnabled && (
              <div className="flex flex-col gap-ds-2">
                <Label>Transcription engine</Label>
                <Select value={form.callAiEngine} onValueChange={(v) => setForm((p) => ({ ...p, callAiEngine: v as 'standard' | 'premium' }))}>
                  <SelectTrigger className="w-72" aria-label="Transcription engine">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard (3 credits per minute)</SelectItem>
                    <SelectItem value="premium" disabled={!saved.premiumAvailable}>
                      Premium for mixed languages (25 credits per minute){saved.premiumAvailable ? '' : ' - not available yet'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => void save()} disabled={saving || !retentionValid} className="gap-ds-2" data-testid="recording-settings-save">
                {saving ? <Spinner className="size-4" /> : <Save className="size-4" />}
                Save recording settings
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
