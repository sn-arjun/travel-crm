'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

export default function EditDriverPage() {
  const router = useRouter();
  const params = useParams();
  const driverId = params.id as string;

  const { data: driverResponse, loading: driverLoading, error: driverError } = useApiQuery(
    () => fleetApi.drivers.getById(driverId),
    [driverId],
  );

  const { mutate: updateDriver, loading: isSubmitting } = useApiMutation(
    (data: any) => fleetApi.drivers.update(driverId, data),
  );

  const driver = driverResponse?.data;

  const [form, setForm] = React.useState({
    name: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    address: '',
    licenseNumber: '',
    licenseExpiry: '',
    licenseType: '',
    badgeNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    bankAccountName: '',
    bankAccountNumber: '',
    bankIFSC: '',
    notes: '',
  });

  // Initialize form when driver loads
  React.useEffect(() => {
    if (driver) {
      setForm({
        // @ts-ignore-next-line
        name: (driver as any).name || '',
        phone: driver.phone || '',
        email: driver.email || '',
        // @ts-ignore-next-line
        dateOfBirth: driver.dateOfBirth || '',
        // @ts-ignore-next-line
        address: driver.address || '',
        licenseNumber: driver.licenseNumber || '',
        licenseExpiry: driver.licenseExpiry || '',
        // @ts-ignore-next-line
        licenseType: driver.licenseType || '',
        // @ts-ignore-next-line
        badgeNumber: driver.badgeNumber || '',
        // @ts-ignore-next-line
        emergencyContactName: driver.emergencyContactName || '',
        // @ts-ignore-next-line
        emergencyContactPhone: driver.emergencyContactPhone || '',
        // @ts-ignore-next-line
        emergencyContactRelation: driver.emergencyContactRelation || '',
        // @ts-ignore-next-line
        bankAccountName: driver.bankAccountName || '',
        // @ts-ignore-next-line
        bankAccountNumber: driver.bankAccountNumber || '',
        // @ts-ignore-next-line
        bankIFSC: driver.bankIFSC || '',
        // @ts-ignore-next-line
        notes: driver.notes || '',
      });
    }
  }, [driver]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await updateDriver(form);
    if (result) {
      toast.success('Driver updated successfully');
      router.push('/fleet/drivers');
    } else {
      toast.error('Failed to update driver');
    }
  }

  if (driverLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading driver...</p>
      </div>
    );
  }

  if (driverError || !driver) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Driver not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Edit Driver</h1>
            // @ts-ignore-next-line
            <p className="text-sm text-muted-foreground">{(driver as any).name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" placeholder="City, State" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="licenseType">License Type</Label>
                  <Input id="licenseType" placeholder="e.g., LMV, HMV, Transport" value={form.licenseType} onChange={(e) => updateField('licenseType', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="badgeNumber">Badge Number</Label>
                  <Input id="badgeNumber" placeholder="Police verification badge" value={form.badgeNumber} onChange={(e) => updateField('badgeNumber', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Contact */}
          <Card>
            <CardHeader><CardTitle className="text-base">Emergency Contact</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactName">Contact Name</Label>
                  <Input id="emergencyContactName" placeholder="Name" value={form.emergencyContactName} onChange={(e) => updateField('emergencyContactName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactPhone">Contact Phone</Label>
                  <Input id="emergencyContactPhone" placeholder="+91 XXXXX XXXXX" value={form.emergencyContactPhone} onChange={(e) => updateField('emergencyContactPhone', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="emergencyContactRelation">Relation</Label>
                  <Input id="emergencyContactRelation" placeholder="e.g., Spouse, Parent" value={form.emergencyContactRelation} onChange={(e) => updateField('emergencyContactRelation', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bank Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Bank Details (for payouts)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bankAccountName">Account Holder Name</Label>
                  <Input id="bankAccountName" placeholder="Name as per bank" value={form.bankAccountName} onChange={(e) => updateField('bankAccountName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAccountNumber">Account Number</Label>
                  <Input id="bankAccountNumber" placeholder="XXXXXXXXXXXX" value={form.bankAccountNumber} onChange={(e) => updateField('bankAccountNumber', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankIFSC">IFSC Code</Label>
                  <Input id="bankIFSC" placeholder="e.g., SBIN0001234" value={form.bankIFSC} onChange={(e) => updateField('bankIFSC', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader><CardTitle className="text-base">Additional Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea id="notes" placeholder="Any notes about the driver..." value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
