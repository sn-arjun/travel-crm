'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { fleetApi } from '@/lib/api/fleet';

export default function NewDriverPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [form, setForm] = React.useState({
    name: '',
    phone: '',
    email: '',
    licenseNumber: '',
    licenseExpiry: '',
    status: 'active' as const,
    experience: 0,
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name || !form.licenseNumber || !form.licenseExpiry || !form.phone) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const dateOfJoining = form.experience > 0
        ? new Date(Date.now() - form.experience * 365.25 * 86400000).toISOString().split('T')[0]
        : undefined;
      await fleetApi.drivers.create({
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        licenseNumber: form.licenseNumber,
        licenseExpiry: form.licenseExpiry,
        dateOfJoining,
      });
      toast.success('Driver created successfully');
      router.push('/fleet/drivers');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create driver');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Add Driver</h1>
            <p className="text-sm text-muted-foreground">Register a new driver</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Driver
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Personal Information */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" />Personal Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-destructive">*</span></Label>
                <Input id="name" placeholder="e.g., Rajesh Kumar" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                  <Input id="phone" placeholder="+91 XXXXX XXXXX" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="driver@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* License Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">License & Credentials</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="licenseNumber">License Number <span className="text-destructive">*</span></Label>
                  <Input id="licenseNumber" placeholder="e.g., DL-0001-2024" value={form.licenseNumber} onChange={(e) => updateField('licenseNumber', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="licenseExpiry">License Expiry <span className="text-destructive">*</span></Label>
                  <Input id="licenseExpiry" type="date" value={form.licenseExpiry} onChange={(e) => updateField('licenseExpiry', e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience">Years of Experience</Label>
                <Input id="experience" type="number" min={0} max={50} value={form.experience} onChange={(e) => updateField('experience', parseInt(e.target.value) || 0)} />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
