'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Loader2,
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

interface NotificationPreferences {
  email: {
    newLead: boolean;
    leadAssigned: boolean;
    taskDue: boolean;
    invoicePaid: boolean;
    newBooking: boolean;
    systemAlerts: boolean;
  };
  push: {
    newLead: boolean;
    leadAssigned: boolean;
    taskDue: boolean;
    invoicePaid: boolean;
    newBooking: boolean;
    systemAlerts: boolean;
  };
  sms: {
    newLead: boolean;
    leadAssigned: boolean;
    taskDue: boolean;
    invoicePaid: boolean;
    newBooking: boolean;
    systemAlerts: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
}

const defaultPrefs: NotificationPreferences = {
  email: {
    newLead: true,
    leadAssigned: true,
    taskDue: true,
    invoicePaid: true,
    newBooking: true,
    systemAlerts: true,
  },
  push: {
    newLead: true,
    leadAssigned: true,
    taskDue: true,
    invoicePaid: false,
    newBooking: true,
    systemAlerts: false,
  },
  sms: {
    newLead: false,
    leadAssigned: false,
    taskDue: false,
    invoicePaid: false,
    newBooking: false,
    systemAlerts: false,
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
  },
};

const notificationTypes = [
  { key: 'newLead', label: 'New Lead', description: 'When a new lead is created or imported' },
  { key: 'leadAssigned', label: 'Lead Assigned', description: 'When a lead is assigned to you' },
  { key: 'taskDue', label: 'Task Due', description: 'When a task is due or overdue' },
  { key: 'invoicePaid', label: 'Invoice Paid', description: 'When an invoice payment is received' },
  { key: 'newBooking', label: 'New Booking', description: 'When a new booking is confirmed' },
  { key: 'systemAlerts', label: 'System Alerts', description: 'Important system notifications' },
] as const;

type NotifKey = (typeof notificationTypes)[number]['key'];

export default function NotificationSettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<NotificationPreferences>(defaultPrefs);

  const { data: prefsResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<NotificationPreferences>>(API_ENDPOINTS.notificationPreferences.me),
    [],
  );

  React.useEffect(() => {
    if (prefsResponse && 'data' in prefsResponse && prefsResponse.data) {
      setPrefs({ ...defaultPrefs, ...(prefsResponse.data as any) });
    }
  }, [prefsResponse]);

  const toggleChannel = (channel: 'email' | 'push' | 'sms', key: NotifKey) => {
    setPrefs((p) => ({
      ...p,
      [channel]: {
        ...p[channel],
        [key]: !p[channel][key],
      },
    }));
  };

  const handleSave = async () => {
    try {
      await client.put(API_ENDPOINTS.notificationPreferences.me, prefs);
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    }
  };

  const handleSaveQuietHours = async () => {
    try {
      await client.put(API_ENDPOINTS.notificationPreferences.quietHours, prefs.quietHours);
      toast.success('Quiet hours settings saved');
    } catch {
      toast.error('Failed to save quiet hours');
    }
  };

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
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Preferences</h1>
          <p className="text-muted-foreground mt-1">Choose how and when you receive notifications</p>
        </div>
      </div>

      {/* Notification Channels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Types
          </CardTitle>
          <CardDescription>Toggle notifications by type and channel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-4 py-2 px-2">
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
                <MessageSquare className="h-3.5 w-3.5" />
                SMS
              </div>
            </div>

            <Separator />

            {notificationTypes.map((nt) => (
              <div
                key={nt.key}
                className="grid grid-cols-[1fr_80px_80px_80px] gap-4 py-3 px-2 rounded-lg hover:bg-muted/50"
              >
                <div>
                  <p className="text-sm font-medium">{nt.label}</p>
                  <p className="text-xs text-muted-foreground">{nt.description}</p>
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs.email[nt.key]}
                    onCheckedChange={() => toggleChannel('email', nt.key)}
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs.push[nt.key]}
                    onCheckedChange={() => toggleChannel('push', nt.key)}
                  />
                </div>
                <div className="flex items-center justify-center">
                  <Switch
                    checked={prefs.sms[nt.key]}
                    onCheckedChange={() => toggleChannel('sms', nt.key)}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-6">
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
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
              checked={prefs.quietHours.enabled}
              onCheckedChange={(v) => setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, enabled: v } }))}
            />
            <Label>Enable Quiet Hours</Label>
          </div>

          {prefs.quietHours.enabled && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quietStart">Start Time</Label>
                <Input
                  id="quietStart"
                  type="time"
                  value={prefs.quietHours.start}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, start: e.target.value } }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quietEnd">End Time</Label>
                <Input
                  id="quietEnd"
                  type="time"
                  value={prefs.quietHours.end}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, end: e.target.value } }))
                  }
                />
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSaveQuietHours} variant="outline" className="gap-2">
              <Save className="h-4 w-4" />
              Save Quiet Hours
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
