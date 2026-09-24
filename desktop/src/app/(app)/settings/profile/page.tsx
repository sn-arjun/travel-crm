'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PhoneInput } from '@/components/ui/phone-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useApiQuery } from '@/hooks/use-api';
import { usersApi } from '@/lib/api/users';
import { useAuthStore } from '@/stores/auth-store';
import type { User } from '@travelcrm/shared';

function initialsOf(name?: string) {
  return (name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const { data: meResponse, loading } = useApiQuery(() => usersApi.getMe(), []);
  const me = React.useMemo(() => (meResponse && 'data' in meResponse ? (meResponse.data as User) : null), [meResponse]);

  const [form, setForm] = React.useState({ name: '', email: '', phone: '', department: '', language: 'en' });
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (me) {
      setForm({
        name: me.name ?? '',
        email: me.email ?? '',
        phone: me.phone ?? '',
        department: me.department ?? '',
        language: me.language ?? 'en',
      });
    }
  }, [me]);

  const handleSave = async () => {
    if (!me) return;
    setIsSaving(true);
    try {
      const result = await usersApi.update(me.id, {
        name: form.name,
        phone: form.phone,
        department: form.department,
        language: form.language,
      } as never);
      if (result && 'data' in result) {
        setUser(result.data as unknown as User);
      }
      toast.success('Profile updated successfully');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Profile"
        description="Manage your personal information and preferences."
        back={
          <Button variant="ghost" size="icon-sm" onClick={() => router.push('/settings')} aria-label="Go back">
            <ArrowLeft aria-hidden="true" />
          </Button>
        }
        actions={
          <Button onClick={handleSave} disabled={isSaving} className="gap-ds-2">
            {isSaving ? <Spinner className="size-4" /> : <Save aria-hidden="true" />}
            Save profile
          </Button>
        }
      />

      <SectionCard title="Personal information" description="Update your name, contact info, and preferences.">
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <div className="flex items-center gap-ds-3 sm:col-span-2">
            <Avatar className="size-16">
              <AvatarFallback className="text-lg font-semibold">{initialsOf(form.name)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{form.name || '—'}</p>
              <p className="text-sm text-ds-foreground-muted">{form.email}</p>
            </div>
          </div>

          <div className="flex flex-col gap-ds-1 sm:col-span-2">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Full name"
            />
          </div>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" type="email" value={form.email} readOnly disabled />
          </div>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="profile-phone">Phone</Label>
            <PhoneInput value={form.phone} onChange={(v) => setForm((p) => ({ ...p, phone: v }))} />
          </div>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="profile-department">Department</Label>
            <Input
              id="profile-department"
              value={form.department}
              onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
              placeholder="e.g., Sales"
            />
          </div>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="profile-language">Language</Label>
            <Select value={form.language} onValueChange={(v) => setForm((p) => ({ ...p, language: v }))}>
              <SelectTrigger id="profile-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
