'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TenantDetail {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'suspended' | 'inactive';
  planId: string;
  businessType?: string;
  website?: string;
  createdAt: string;
  subscription?: {
    plan: string;
    status: 'active' | 'cancelled' | 'expired';
    renewalDate?: string;
  };
  stats?: {
    userCount: number;
    contactCount: number;
    leadCount: number;
    invoiceCount: number;
  };
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [formData, setFormData] = useState<Partial<TenantDetail>>({});
  const [isEditing, setIsEditing] = useState(false);

  const { data: tenant, loading, error } = useApiQuery<TenantDetail>(async () => {
    const response = await client.get<{ data: TenantDetail }>(API_ENDPOINTS.admin.tenantById(tenantId));
    setFormData(response.data);
    return response.data;
  });

  const updateMutation = useApiMutation<Partial<TenantDetail>, TenantDetail>(async (data) => {
    const response = await client.put<{ data: TenantDetail }>(API_ENDPOINTS.admin.tenantUpdate(tenantId), data);
    return response.data;
  });

  const suspendMutation = useApiMutation<void, void>(async () => {
    await client.post(API_ENDPOINTS.admin.tenantSuspend(tenantId));
  });

  const activateMutation = useApiMutation<void, void>(async () => {
    await client.post(API_ENDPOINTS.admin.tenantActivate(tenantId));
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleStatusChange = (value: string) => {
    setFormData((prev) => ({
      ...prev,
      status: value as 'active' | 'suspended' | 'inactive',
    }));
  };

  const handleSave = async () => {
    const result = await updateMutation.mutate(formData);
    if (result) {
      toast.success('Tenant updated successfully');
      setIsEditing(false);
    } else if (updateMutation.error) {
      toast.error(updateMutation.error.message);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('Are you sure you want to suspend this tenant? They will not be able to access the system.')) {
      return;
    }

    await suspendMutation.mutate();
    if (!suspendMutation.error) {
      toast.success('Tenant suspended successfully');
    } else {
      toast.error(suspendMutation.error.message);
    }
  };

  const handleActivate = async () => {
    if (!confirm('Are you sure you want to activate this tenant?')) {
      return;
    }

    await activateMutation.mutate();
    if (!activateMutation.error) {
      toast.success('Tenant activated successfully');
    } else {
      toast.error(activateMutation.error.message);
    }
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Tenant</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
        <Link href="/super-admin/tenants">
          <Button>Back to Tenants</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading tenant details...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/super-admin/tenants">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{tenant?.name}</h1>
            <p className="text-gray-600 mt-1">{tenant?.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tenant?.status === 'active' ? (
            <Button variant="destructive" onClick={handleSuspend} disabled={suspendMutation.loading}>
              {suspendMutation.loading ? 'Suspending...' : 'Suspend'}
            </Button>
          ) : (
            <Button variant="outline" onClick={handleActivate} disabled={activateMutation.loading}>
              {activateMutation.loading ? 'Activating...' : 'Activate'}
            </Button>
          )}
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)}>Edit</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                {isEditing ? 'Update tenant details' : 'Tenant account details'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Company Name</label>
                  <Input
                    name="name"
                    value={formData.name ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Email</label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Phone</label>
                  <Input
                    name="phone"
                    value={formData.phone ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Website</label>
                  <Input
                    name="website"
                    type="url"
                    value={formData.website ?? ''}
                    onChange={handleChange}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Business Type</label>
                <Input
                  name="businessType"
                  value={formData.businessType ?? ''}
                  onChange={handleChange}
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Status</label>
                <Select
                  value={formData.status ?? 'active'}
                  onValueChange={handleStatusChange}
                  disabled={!isEditing}
                >
                  <SelectTrigger disabled={!isEditing}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {updateMutation.error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{updateMutation.error.message}</p>
                </div>
              )}

              {isEditing && (
                <div className="flex justify-end gap-4 pt-4">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={updateMutation.loading}>
                    {updateMutation.loading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {tenant?.status === 'active' ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-semibold text-green-700">Active</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-500" />
                    <span className="font-semibold text-red-700">
                      {tenant?.status?.charAt(0).toUpperCase()}
                      {tenant?.status?.slice(1)}
                    </span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subscription Info */}
          {tenant?.subscription && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Subscription</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-gray-600">Plan</p>
                  <p className="font-semibold">{tenant.subscription.plan}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <p className="font-semibold capitalize">{tenant.subscription.status}</p>
                </div>
                {tenant.subscription.renewalDate && (
                  <div>
                    <p className="text-xs text-gray-600">Renewal Date</p>
                    <p className="font-semibold">{new Date(tenant.subscription.renewalDate).toLocaleDateString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Stats */}
          {tenant?.stats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Users</span>
                  <span className="font-semibold">{tenant.stats.userCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Contacts</span>
                  <span className="font-semibold">{tenant.stats.contactCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Leads</span>
                  <span className="font-semibold">{tenant.stats.leadCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Invoices</span>
                  <span className="font-semibold">{tenant.stats.invoiceCount}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-600">Created</p>
                <p className="font-semibold text-sm">{new Date(tenant?.createdAt ?? '').toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
