'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { AlertCircle, Save } from 'lucide-react';

interface GlobalConfig {
  id: string;
  appName: string;
  appUrl: string;
  supportEmail: string;
  supportPhone?: string;
  maxTenantsPerPlan?: Record<string, number>;
  features?: {
    emailNotifications: boolean;
    smsNotifications: boolean;
    twoFactor: boolean;
    apiAccess: boolean;
    customDomain: boolean;
    whiteLabel: boolean;
    advancedAnalytics: boolean;
  };
  security?: {
    passwordMinLength: number;
    passwordRequireSpecialChar: boolean;
    passwordRequireNumbers: boolean;
    passwordExpireDays?: number;
    maxLoginAttempts: number;
    sessionTimeoutMinutes: number;
    requireEmailVerification: boolean;
  };
  email?: {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    fromEmail: string;
    fromName: string;
  };
}

export default function ConfigPage() {
  const [formData, setFormData] = useState<Partial<GlobalConfig>>({});
  const [isEditing, setIsEditing] = useState(false);

  const { data: config, loading, error } = useApiQuery<GlobalConfig>(async () => {
    const response = await client.get<{ data: GlobalConfig }>(API_ENDPOINTS.admin.globalConfig);
    setFormData(response.data);
    return response.data;
  });

  const updateMutation = useApiMutation<Partial<GlobalConfig>, GlobalConfig>(async (data) => {
    const response = await client.put<{ data: GlobalConfig }>(API_ENDPOINTS.admin.configUpdate, data);
    return response.data;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    const keys = name.split('.');
    if (keys.length > 1) {
      setFormData((prev) => {
        const key0 = keys[0];
        const key1 = keys[1];
        if (!key0 || !key1) return prev;
        return {
          ...prev,
          [key0]: {
            ...((prev as any)[key0] as Record<string, any>),
            [key1]: value,
          },
        };
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleCheckboxChange = (path: string, value: boolean) => {
    const keys = path.split('.');
    setFormData((prev) => {
      const newData = { ...prev } as any;
      let current = newData;
      for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!key) continue;
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
      const lastKey = keys[keys.length - 1];
      if (lastKey) {
        current[lastKey] = value;
      }
      return newData;
    });
  };

  const handleSave = async () => {
    const result = await updateMutation.mutate(formData);
    if (result) {
      toast.success('Configuration updated successfully');
      setIsEditing(false);
    } else if (updateMutation.error) {
      toast.error(updateMutation.error.message);
    }
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Configuration</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Global Configuration</h1>
          <p className="text-gray-600 mt-1">Manage platform-wide settings</p>
        </div>
        <div className="flex gap-2">
          {!isEditing && <Button onClick={() => setIsEditing(true)}>Edit</Button>}
          {isEditing && (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.loading}>
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.loading ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Basic Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>Basic application information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Application Name</label>
            <Input
              name="appName"
              value={formData.appName ?? ''}
              onChange={handleChange}
              disabled={!isEditing}
              placeholder="TravelCRM"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Application URL</label>
            <Input
              name="appUrl"
              type="url"
              value={formData.appUrl ?? ''}
              onChange={handleChange}
              disabled={!isEditing}
              placeholder="https://app.travelcrm.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Support Email</label>
              <Input
                name="supportEmail"
                type="email"
                value={formData.supportEmail ?? ''}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="support@travelcrm.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Support Phone</label>
              <Input
                name="supportPhone"
                type="tel"
                value={formData.supportPhone ?? ''}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="+1-800-XXX-XXXX"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Flags</CardTitle>
          <CardDescription>Enable or disable platform features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {config?.features &&
              Object.entries(config.features).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="text-sm text-gray-600">Enable {key.replace(/([A-Z])/g, ' $1').toLowerCase()}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => handleCheckboxChange(`features.${key}`, e.target.checked)}
                    disabled={!isEditing}
                    className="w-5 h-5"
                  />
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
          <CardDescription>Configure platform security policies</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Password Min Length</label>
              <Input
                name="security.passwordMinLength"
                type="number"
                value={formData.security?.passwordMinLength ?? 8}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Max Login Attempts</label>
              <Input
                name="security.maxLoginAttempts"
                type="number"
                value={formData.security?.maxLoginAttempts ?? 5}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Session Timeout (minutes)</label>
              <Input
                name="security.sessionTimeoutMinutes"
                type="number"
                value={formData.security?.sessionTimeoutMinutes ?? 30}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Password Expiry (days)</label>
              <Input
                name="security.passwordExpireDays"
                type="number"
                value={formData.security?.passwordExpireDays ?? 90}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>
          </div>

          <div className="space-y-4">
            {[
              { key: 'security.passwordRequireSpecialChar', label: 'Require Special Characters', desc: 'Passwords must contain special characters' },
              { key: 'security.passwordRequireNumbers', label: 'Require Numbers', desc: 'Passwords must contain numbers' },
              { key: 'security.requireEmailVerification', label: 'Require Email Verification', desc: 'Users must verify email on signup' },
            ].map(({ key, label, desc }) => {
              const fieldKey = key.split('.')[1];
              const isChecked = fieldKey ? ((formData.security as any)?.[fieldKey] as boolean) ?? false : false;
              return (
              <div key={key} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-gray-600">{desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => handleCheckboxChange(key, e.target.checked)}
                  disabled={!isEditing}
                  className="w-5 h-5"
                />
              </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Email Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Email Configuration</CardTitle>
          <CardDescription>SMTP and email settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">SMTP Host</label>
              <Input
                name="email.smtpHost"
                value={formData.email?.smtpHost ?? ''}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="smtp.gmail.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">SMTP Port</label>
              <Input
                name="email.smtpPort"
                type="number"
                value={formData.email?.smtpPort ?? 587}
                onChange={handleChange}
                disabled={!isEditing}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">SMTP User</label>
              <Input
                name="email.smtpUser"
                value={formData.email?.smtpUser ?? ''}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="noreply@travelcrm.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">From Email</label>
              <Input
                name="email.fromEmail"
                type="email"
                value={formData.email?.fromEmail ?? ''}
                onChange={handleChange}
                disabled={!isEditing}
                placeholder="noreply@travelcrm.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">From Name</label>
            <Input
              name="email.fromName"
              value={formData.email?.fromName ?? ''}
              onChange={handleChange}
              disabled={!isEditing}
              placeholder="TravelCRM Support"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Error */}
      {updateMutation.error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-sm text-red-700">{updateMutation.error.message}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
