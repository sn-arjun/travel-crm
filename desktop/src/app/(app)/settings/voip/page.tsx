'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Wifi,
  WifiOff,
  TestTube2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  Button,
  Input,
  Label,
  SectionCard,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Badge,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import {
  voipApi,
  type UpdateVoipSettingsRequest,
  type VoipProviderName,
  type VoipRecordingPolicy,
  type VoipRoutingStrategy,
} from '@/lib/api/voip';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { PageContainer } from '@/components/layout/page-container';

type VoipToggleKey = 'voicemailEnabled' | 'ivrEnabled' | 'businessHoursEnabled';

const TOGGLE_ROWS: { key: VoipToggleKey; label: string; description: string }[] = [
  { key: 'voicemailEnabled', label: 'Voicemail', description: 'Enable voicemail for missed calls' },
  { key: 'ivrEnabled', label: 'IVR Menu', description: 'Greet callers with an interactive voice menu' },
  { key: 'businessHoursEnabled', label: 'Business Hours', description: 'Route calls differently outside business hours' },
];

const MASKED = /^\*{4}/;

function VoipSettingsPageContent() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [showAccountId, setShowAccountId] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ connected: boolean; message: string } | null>(null);

  const { data: settingsResponse, loading, refetch } = useApiQuery(
    () => voipApi.settings.get(),
    [],
  );

  const voipSettings = React.useMemo(() => {
    if (!settingsResponse || !('data' in settingsResponse)) return null;
    return settingsResponse.data ?? null;
  }, [settingsResponse]);

  const [form, setForm] = React.useState({
    voipProvider: 'twilio' as VoipProviderName,
    providerAccountId: '',
    providerAuthToken: '',
    defaultCallerId: '',
    recordingPolicy: 'all' as VoipRecordingPolicy,
    routingStrategy: 'assigned' as VoipRoutingStrategy,
    maxRingDuration: 30,
    voicemailEnabled: true,
    ivrEnabled: false,
    businessHoursEnabled: false,
  });

  // The backend masks secrets (`****abcd`); keep the mask out of the input and
  // only send a token when the user typed a new one.
  const savedAccountId = voipSettings?.providerAccountId ?? voipSettings?.twilioAccountSid ?? '';
  const savedTokenMask = voipSettings?.providerAuthToken ?? voipSettings?.twilioAuthToken ?? '';

  React.useEffect(() => {
    if (voipSettings) {
      setForm({
        voipProvider: voipSettings.voipProvider ?? 'twilio',
        providerAccountId: savedAccountId,
        providerAuthToken: '',
        defaultCallerId: voipSettings.defaultCallerId ?? '',
        recordingPolicy: voipSettings.recordingPolicy ?? 'all',
        routingStrategy: voipSettings.routingStrategy ?? 'assigned',
        maxRingDuration: voipSettings.maxRingDuration ?? 30,
        voicemailEnabled: voipSettings.voicemailEnabled ?? true,
        ivrEnabled: voipSettings.ivrEnabled ?? false,
        businessHoursEnabled: voipSettings.businessHoursEnabled ?? false,
      });
    }
  }, [voipSettings, savedAccountId]);

  const updateMutation = useApiMutation<UpdateVoipSettingsRequest, unknown>((data) =>
    voipApi.settings.update(data),
  );

  const handleSave = async () => {
    const payload: UpdateVoipSettingsRequest = {
      voipProvider: form.voipProvider,
      providerAccountId: form.providerAccountId || null,
      defaultCallerId: form.defaultCallerId || null,
      recordingPolicy: form.recordingPolicy,
      routingStrategy: form.routingStrategy,
      maxRingDuration: form.maxRingDuration,
      voicemailEnabled: form.voicemailEnabled,
      ivrEnabled: form.ivrEnabled,
      businessHoursEnabled: form.businessHoursEnabled,
    };
    if (form.providerAuthToken && !MASKED.test(form.providerAuthToken)) {
      payload.providerAuthToken = form.providerAuthToken;
    }
    const result = await updateMutation.mutate(payload);
    if (result) {
      toast.success('VoIP settings saved');
      refetch();
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to save VoIP settings');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await voipApi.settings.testConnection();
      const data = (result as { data?: { connected: boolean; accountName?: string; error?: string } })?.data;
      if (data) {
        const message = data.connected
          ? data.accountName
            ? `Connected to ${data.accountName}`
            : 'Connection successful'
          : (data.error ?? 'Connection failed');
        setTestResult({ connected: data.connected, message });
      }
    } catch (e) {
      setTestResult({ connected: false, message: (e as Error)?.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const isConnected = testResult?.connected ?? false;

  const backButton = (
    <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
      <ArrowLeft className="size-4" />
    </Button>
  );

  if (gateLoading || loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-ds-4">
        <PageHeader title="VoIP Settings" description="Configure your voice-over-IP provider and calling features" back={backButton} />
        <SectionCard title="VoIP calling is not available on your plan">
          <p className="mb-ds-4 text-sm text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'You have reached your VoIP usage limit for this billing period.'
              : 'Upgrade your plan to configure a VoIP provider and enable calling.'}
          </p>
          <Button asChild>
            <a href={upgradeHref}>{reason === 'cap_exceeded' ? 'View plans' : 'Upgrade to enable'}</a>
          </Button>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader
        title="VoIP Settings"
        description="Configure your voice-over-IP provider and calling features"
        back={backButton}
        status={
          <Badge
            variant={testResult === null ? 'outline' : isConnected ? 'default' : 'destructive'}
            className={isConnected ? 'gap-ds-1 bg-ds-success-subtle text-ds-success-on-subtle' : 'gap-ds-1'}
          >
            {isConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {testResult === null ? 'Not tested' : isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        }
      />

      <SectionCard
        title="Provider Configuration"
        description="Select your VoIP provider and enter API credentials"
      >
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-2">
            <Label>Provider</Label>
            <Select
              value={form.voipProvider}
              onValueChange={(v) => setForm((p) => ({ ...p, voipProvider: v as VoipProviderName }))}
            >
              <SelectTrigger className="w-60" aria-label="Provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="plivo">Plivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="providerAccountId">Account SID / ID</Label>
            <div className="relative">
              <Input
                id="providerAccountId"
                type={showAccountId ? 'text' : 'password'}
                autoComplete="off"
                data-secret
                value={form.providerAccountId}
                onChange={(e) => setForm((p) => ({ ...p, providerAccountId: e.target.value }))}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowAccountId(!showAccountId)}
                aria-label={showAccountId ? 'Hide account SID' : 'Show account SID'}
              >
                {showAccountId ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            {form.providerAccountId && !showAccountId && (
              <p className="text-xs text-ds-foreground-muted">
                Saved account ending in {form.providerAccountId.slice(-4)}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="providerAuthToken">Auth Token</Label>
            <div className="relative">
              <Input
                id="providerAuthToken"
                autoComplete="off"
                data-secret
                type={showApiKey ? 'text' : 'password'}
                value={form.providerAuthToken}
                onChange={(e) => setForm((p) => ({ ...p, providerAuthToken: e.target.value }))}
                placeholder={savedTokenMask ? `Saved (${savedTokenMask}) — type to replace` : 'Enter your auth token'}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide auth token' : 'Show auth token'}
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-ds-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !savedAccountId}
              className="gap-ds-2"
            >
              {testing ? <Spinner className="size-4" /> : <TestTube2 className="size-4" />}
              Test Connection
            </Button>
            {testResult && (
              <div className="flex items-center gap-ds-2 text-sm" data-testid="voip-test-result">
                {testResult.connected ? (
                  <CheckCircle2 className="size-4 text-ds-success" />
                ) : (
                  <XCircle className="size-4 text-ds-danger" />
                )}
                <span className={testResult.connected ? 'text-ds-success' : 'text-ds-danger'}>
                  {testResult.message}
                </span>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Calling Behaviour" description="Caller ID, recording and routing for calls">
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="defaultCallerId">Default caller ID</Label>
            <Input
              id="defaultCallerId"
              value={form.defaultCallerId}
              onChange={(e) => setForm((p) => ({ ...p, defaultCallerId: e.target.value }))}
              placeholder="+15550001234"
            />
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="maxRingDuration">Max ring duration (seconds)</Label>
            <Input
              id="maxRingDuration"
              type="number"
              min={10}
              max={60}
              className="w-40"
              value={form.maxRingDuration}
              onChange={(e) => setForm((p) => ({ ...p, maxRingDuration: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label>Call recording</Label>
            <Select
              value={form.recordingPolicy}
              onValueChange={(v) => setForm((p) => ({ ...p, recordingPolicy: v as VoipRecordingPolicy }))}
            >
              <SelectTrigger className="w-60" aria-label="Call recording">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Record all calls</SelectItem>
                <SelectItem value="inbound">Inbound only</SelectItem>
                <SelectItem value="outbound">Outbound only</SelectItem>
                <SelectItem value="none">Do not record</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-ds-2">
            <Label>Routing strategy</Label>
            <Select
              value={form.routingStrategy}
              onValueChange={(v) => setForm((p) => ({ ...p, routingStrategy: v as VoipRoutingStrategy }))}
            >
              <SelectTrigger className="w-60" aria-label="Routing strategy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned agent</SelectItem>
                <SelectItem value="round_robin">Round robin</SelectItem>
                <SelectItem value="least_recent">Least recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Calling Features" description="Enable or disable specific VoIP capabilities">
        <div className="flex flex-col divide-y divide-ds-border">
          {TOGGLE_ROWS.map((feature) => (
            <div key={feature.key} className="flex items-center justify-between py-ds-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-ds-foreground">{feature.label}</p>
                <p className="text-xs text-ds-foreground-muted">{feature.description}</p>
              </div>
              <Switch
                aria-label={feature.label}
                checked={form[feature.key]}
                onCheckedChange={(v) => setForm((p) => ({ ...p, [feature.key]: v }))}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end gap-ds-2">
        <Button onClick={handleSave} disabled={updateMutation.loading} className="gap-ds-2">
          {updateMutation.loading && <Spinner className="size-4" />}
          <Save className="size-4" />
          Save VoIP Settings
        </Button>
      </div>
    </div>
  );
}

export default function VoipSettingsPage() {
  return (
    <PageContainer>
      <VoipSettingsPageContent />
    </PageContainer>
  );
}
