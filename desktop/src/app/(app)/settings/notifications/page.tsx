'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import {
  ArrowLeft,
  Save,
  Loader2,
  Bell,
  Mail,
  Smartphone,
  Moon,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

// ─── Backend format (type-first, per-channel) ─────────────────
// Each key is a notification type (snake_case)
// Value is { push_enabled, in_app_enabled, email_enabled }
type ChannelPrefs = { push_enabled: boolean; in_app_enabled: boolean; email_enabled: boolean };
type NotificationPreferences = Record<string, ChannelPrefs>;

// Backend quiet hours format
interface QuietHours {
  startHour: number;
  endHour: number;
  enabled?: boolean;
}

// UI quiet hours state (for time inputs)
interface QuietHoursUi {
  enabled: boolean;
  startHour: number; // 0-23
  endHour: number;   // 0-23
}

// ─── The 8 backend notification types ─────────────────────────
const NOTIFICATION_TYPES = [
  { key: 'lead_assigned', label: 'Lead Assigned', description: 'When a lead is assigned to you' },
  { key: 'lead_status_change', label: 'Lead Status Change', description: 'When a lead\'s status changes' },
  { key: 'follow_up_reminder', label: 'Follow-up Reminder', description: '15 minutes before a scheduled follow-up' },
  { key: 'payment_received', label: 'Payment Received', description: 'When a payment is recorded' },
  { key: 'task_assigned', label: 'Task Assigned', description: 'When a task is assigned to you' },
  { key: 'birthday', label: 'Birthday Reminder', description: 'Contact birthdays and anniversaries' },
  { key: 'invoice_overdue', label: 'Invoice Overdue', description: 'When an invoice becomes overdue' },
  { key: 'announcement', label: 'Announcements', description: 'Team-wide admin announcements' },
] as const;

type NotifKey = (typeof NOTIFICATION_TYPES)[number]['key'];

const DEFAULT_PREFS: NotificationPreferences = Object.fromEntries(
  NOTIFICATION_TYPES.map(({ key }) => [key, { push_enabled: true, in_app_enabled: true, email_enabled: key === 'announcement' || key === 'payment_received' }])
);

function hourToTime(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}
function timeToHour(t: string): number {
  return parseInt(t.split(':')[0] ?? '0', 10);
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<NotificationPreferences>(DEFAULT_PREFS);
  const [muteAll, setMuteAll] = React.useState(false);
  const [quietHoursUi, setQuietHoursUi] = React.useState<QuietHoursUi>({ enabled: false, startHour: 22, endHour: 7 });
  const [saving, setSaving] = React.useState(false);
  const [savingQh, setSavingQh] = React.useState(false);

  const { data: prefsResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<NotificationPreferences>>(API_ENDPOINTS.notificationPreferences.me),
    [],
  );

  const { data: qhResponse } = useApiQuery(
    () => client.get<ApiResponse<QuietHours>>(API_ENDPOINTS.notificationPreferences.quietHours),
    [],
  );

  React.useEffect(() => {
    if (prefsResponse && 'data' in prefsResponse && prefsResponse.data) {
      // Backend returns { preferences: {...}, quietHours: {...} } — extract just preferences
      const raw = prefsResponse.data as unknown as { preferences?: NotificationPreferences } & NotificationPreferences;
      const data: NotificationPreferences = raw.preferences ?? raw;
      // Merge with defaults to ensure all keys present
      setPrefs({ ...DEFAULT_PREFS, ...data });
    }
  }, [prefsResponse]);

  React.useEffect(() => {
    if (qhResponse && 'data' in qhResponse && qhResponse.data) {
      const qh = qhResponse.data as QuietHours;
      if (qh.startHour !== undefined) {
        setQuietHoursUi({ enabled: qh.enabled ?? true, startHour: qh.startHour, endHour: qh.endHour });
      }
    }
  }, [qhResponse]);

  const toggleChannel = (key: NotifKey, channel: 'push_enabled' | 'in_app_enabled' | 'email_enabled') => {
    setPrefs((p) => {
      const current: ChannelPrefs = p[key] ?? { push_enabled: false, in_app_enabled: false, email_enabled: false };
      return { ...p, [key]: { ...current, [channel]: !current[channel] } };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await client.put(API_ENDPOINTS.notificationPreferences.me, { preferences: prefs });
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveQuietHours = async () => {
    setSavingQh(true);
    try {
      if (!quietHoursUi.enabled) {
        await client.delete(API_ENDPOINTS.notificationPreferences.quietHours);
        toast.success('Quiet hours disabled');
      } else {
        const payload: QuietHours = {
          startHour: quietHoursUi.startHour,
          endHour: quietHoursUi.endHour,
        };
        await client.put(API_ENDPOINTS.notificationPreferences.quietHours, payload);
        toast.success('Quiet hours saved');
      }
    } catch {
      toast.error('Failed to save quiet hours');
    } finally {
      setSavingQh(false);
    }
  };

  const header = (
    <PageHeader
      title="Notification preferences"
      description="Choose how and when you receive notifications"
      back={
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')} aria-label="Back to settings">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      }
    />
  );

  if (loading) {
    return (
      <PageContainer>
        {header}
        <div className="flex items-center justify-center py-ds-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}

      {/* Mute All toggle */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <VolumeX className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Mute All Notifications</p>
                <p className="text-sm text-muted-foreground">Temporarily silence all non-critical alerts</p>
              </div>
            </div>
            <Switch checked={muteAll} onCheckedChange={setMuteAll} />
          </div>
        </CardContent>
      </Card>

      {/* Notification Channels */}
      <Card className={muteAll ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Types
          </CardTitle>
          <CardDescription>Toggle notifications by type and delivery channel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_5rem_5rem_5rem] gap-4 py-2 px-2">
              <div />
              <div className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Email
              </div>
              <div className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" />
                Push
              </div>
              <div className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
                <Bell className="h-3.5 w-3.5" />
                In-App
              </div>
            </div>

            <Separator />

            {NOTIFICATION_TYPES.map((nt) => (
              <div
                key={nt.key}
                className="grid grid-cols-[1fr_5rem_5rem_5rem] gap-4 py-3 px-2 rounded-lg hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{nt.label}</p>
                  <p className="text-xs text-muted-foreground">{nt.description}</p>
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs[nt.key]?.email_enabled ?? false}
                    onCheckedChange={() => toggleChannel(nt.key, 'email_enabled')}
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs[nt.key]?.push_enabled ?? false}
                    onCheckedChange={() => toggleChannel(nt.key, 'push_enabled')}
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs[nt.key]?.in_app_enabled ?? false}
                    onCheckedChange={() => toggleChannel(nt.key, 'in_app_enabled')}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            Quiet Hours
          </CardTitle>
          <CardDescription>Pause non-critical notifications during specified hours</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={quietHoursUi.enabled}
              onCheckedChange={(v) => setQuietHoursUi((p) => ({ ...p, enabled: v }))}
            />
            <Label>Enable Quiet Hours</Label>
          </div>

          {quietHoursUi.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quietStart">Start Time</Label>
                <Input
                  id="quietStart"
                  type="time"
                  value={hourToTime(quietHoursUi.startHour)}
                  onChange={(e) => setQuietHoursUi((p) => ({ ...p, startHour: timeToHour(e.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quietEnd">End Time</Label>
                <Input
                  id="quietEnd"
                  type="time"
                  value={hourToTime(quietHoursUi.endHour)}
                  onChange={(e) => setQuietHoursUi((p) => ({ ...p, endHour: timeToHour(e.target.value) }))}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveQuietHours} disabled={savingQh} variant="outline" className="gap-2">
              {savingQh ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Quiet Hours
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
