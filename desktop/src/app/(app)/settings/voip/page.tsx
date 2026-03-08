'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Loader2,
  Phone,
  Wifi,
  WifiOff,
  TestTube2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { voipApi, type UpdateVoipSettingsRequest } from '@/lib/api/voip';
import { cn } from '@/lib/utils';

export default function VoipSettingsPage() {
  const router = useRouter();
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

  const updateMutation = useApiMutation<UpdateVoipSettingsRequest, any>((data) =>
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
      const data = (result as any)?.data ?? result;
      setTestResult(data);
      if (data?.connected) {
        toast.success('Connection successful');
      } else {
        toast.error(data?.message ?? 'Connection failed');
      }
    } catch {
      setTestResult({ connected: false, message: 'Connection test failed' });
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const isConnected = voipSettings?.connected ?? false;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">VoIP Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your voice-over-IP provider and calling features</p>
        </div>
        <Badge
          className={cn(
            'gap-1',
            isConnected
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
          )}
        >
          {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {isConnected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      {/* Provider & Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Provider Configuration
          </CardTitle>
          <CardDescription>Select your VoIP provider and enter API credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={form.provider}
              onValueChange={(v) => setForm((p) => ({ ...p, provider: v as any }))}
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

          <div className="space-y-2">
            <Label htmlFor="accountSid">Account SID / ID</Label>
            <Input
              id="accountSid"
              value={form.accountSid}
              onChange={(e) => setForm((p) => ({ ...p, accountSid: e.target.value }))}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
          </div>

          <div className="space-y-2">
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
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testing || !form.accountSid || !form.apiKey}
              className="gap-2"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
              Test Connection
            </Button>
            {testResult && (
              <div className="flex items-center gap-2 text-sm">
                {testResult.connected ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                <span className={testResult.connected ? 'text-green-600' : 'text-red-600'}>
                  {testResult.message}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle>Calling Features</CardTitle>
          <CardDescription>Enable or disable specific VoIP capabilities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'inboundCalls', label: 'Inbound Calls', description: 'Receive incoming calls in the CRM' },
            { key: 'outboundCalls', label: 'Outbound Calls', description: 'Make calls directly from the CRM' },
            { key: 'voicemail', label: 'Voicemail', description: 'Enable voicemail for missed calls' },
            { key: 'transcription', label: 'Call Transcription', description: 'Automatically transcribe call recordings' },
            { key: 'recording', label: 'Call Recording', description: 'Record calls for quality and training' },
          ].map((feature) => (
            <div key={feature.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">{feature.label}</p>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Switch
                checked={(form.features as any)[feature.key]}
                onCheckedChange={(v) =>
                  setForm((p) => ({
                    ...p,
                    features: { ...p.features, [feature.key]: v },
                  }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateMutation.loading} className="gap-2">
          {updateMutation.loading && <Loader2 className="h-4 w-4 animate-spin" />}
          <Save className="h-4 w-4" />
          Save VoIP Settings
        </Button>
      </div>
    </div>
  );
}
