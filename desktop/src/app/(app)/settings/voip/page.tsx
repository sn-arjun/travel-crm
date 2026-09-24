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
import { voipApi, type UpdateVoipSettingsRequest } from '@/lib/api/voip';
import { useFeatureGate } from '@/hooks/use-feature-gate';

type VoipFeatureKey = keyof NonNullable<UpdateVoipSettingsRequest['features']>;

const FEATURE_ROWS: { key: VoipFeatureKey; label: string; description: string }[] = [
  { key: 'inboundCalls', label: 'Inbound Calls', description: 'Receive incoming calls in the CRM' },
  { key: 'outboundCalls', label: 'Outbound Calls', description: 'Make calls directly from the CRM' },
  { key: 'voicemail', label: 'Voicemail', description: 'Enable voicemail for missed calls' },
  { key: 'transcription', label: 'Call Transcription', description: 'Automatically transcribe call recordings' },
  { key: 'recording', label: 'Call Recording', description: 'Record calls for quality and training' },
];

export default function VoipSettingsPage() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ connected: boolean; message: string } | null>(null);

  const { data: settingsResponse, loading } = useApiQuery(
    () => voipApi.settings.get(),
    [],
  );

  const voipSettings = React.useMemo(() => {
    if (!settingsResponse || !('data' in settingsResponse)) return null;
    return settingsResponse.data ?? null;
  }, [settingsResponse]);

  const [form, setForm] = React.useState({
    provider: 'twilio' as 'twilio' | 'vonage' | 'other',
    accountSid: '',
    apiKey: '',
    features: {
      inboundCalls: true,
      outboundCalls: true,
      voicemail: false,
      transcription: false,
      recording: false,
    },
  });

  React.useEffect(() => {
    if (voipSettings) {
      setForm({
        provider: voipSettings.provider ?? 'twilio',
        accountSid: voipSettings.accountSid ?? '',
        apiKey: voipSettings.apiKey ?? '',
        features: {
          inboundCalls: voipSettings.features?.inboundCalls ?? true,
          outboundCalls: voipSettings.features?.outboundCalls ?? true,
          voicemail: voipSettings.features?.voicemail ?? false,
          transcription: voipSettings.features?.transcription ?? false,
          recording: voipSettings.features?.recording ?? false,
        },
      });
    }
  }, [voipSettings]);

  const updateMutation = useApiMutation<UpdateVoipSettingsRequest, unknown>((data) =>
    voipApi.settings.update(data),
  );

  const handleSave = async () => {
    const result = await updateMutation.mutate({
      provider: form.provider,
      accountSid: form.accountSid,
      apiKey: form.apiKey,
      features: form.features,
    });
    if (result) {
      toast.success('VoIP settings saved');
    } else {
      toast.error(updateMutation.error?.message ?? 'Failed to save VoIP settings');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await voipApi.settings.testConnection();
      const data = (result as { data?: { connected: boolean; message: string } })?.data;
      if (data) {
        setTestResult(data);
        if (data.connected) {
          toast.success('Connection successful');
        } else {
          toast.error(data.message ?? 'Connection failed');
        }
      }
    } catch {
      setTestResult({ connected: false, message: 'Connection test failed' });
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const isConnected = voipSettings?.connected ?? false;

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
            variant={isConnected ? 'default' : 'destructive'}
            className={isConnected ? 'gap-ds-1 bg-ds-success-subtle text-ds-success-on-subtle' : 'gap-ds-1'}
          >
            {isConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {isConnected ? 'Connected' : 'Disconnected'}
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
              value={form.provider}
              onValueChange={(v) => setForm((p) => ({ ...p, provider: v as typeof form.provider }))}
            >
              <SelectTrigger className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="twilio">Twilio</SelectItem>
                <SelectItem value="vonage">Plivo / Vonage</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="accountSid">Account SID / ID</Label>
            <Input
              id="accountSid"
              value={form.accountSid}
              onChange={(e) => setForm((p) => ({ ...p, accountSid: e.target.value }))}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="apiKey">Auth Token / API Key</Label>
            <div className="relative">
              <Input
                id="apiKey"
                type={showApiKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="Enter your API key"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-ds-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !form.accountSid || !form.apiKey}
              className="gap-ds-2"
            >
              {testing ? <Spinner className="size-4" /> : <TestTube2 className="size-4" />}
              Test Connection
            </Button>
            {testResult && (
              <div className="flex items-center gap-ds-2 text-sm">
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

      <SectionCard title="Calling Features" description="Enable or disable specific VoIP capabilities">
        <div className="flex flex-col divide-y divide-ds-border">
          {FEATURE_ROWS.map((feature) => (
            <div key={feature.key} className="flex items-center justify-between py-ds-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-ds-foreground">{feature.label}</p>
                <p className="text-xs text-ds-foreground-muted">{feature.description}</p>
              </div>
              <Switch
                checked={form.features[feature.key]}
                onCheckedChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    features: { ...p.features, [feature.key]: v },
                  }))
                }
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
