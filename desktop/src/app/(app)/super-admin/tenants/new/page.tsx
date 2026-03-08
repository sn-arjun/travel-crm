'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiMutation } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CreateTenantInput {
  name: string;
  email: string;
  phone?: string;
  planId: string;
  businessType?: string;
  website?: string;
}

export default function NewTenantPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<CreateTenantInput>({
    name: '',
    email: '',
    phone: '',
    planId: 'starter',
    businessType: '',
    website: '',
  });

  const { mutate, loading, error } = useApiMutation<CreateTenantInput, { id: string }>(async (data) => {
    const response = await client.post<{ data: { id: string } }>(API_ENDPOINTS.admin.tenantCreate, data);
    return response.data;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.planId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const result = await mutate(formData);
    if (result) {
      toast.success('Tenant created successfully');
      router.push(`/super-admin/tenants/${result.id}`);
    } else if (error) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/super-admin/tenants">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Create New Tenant</h1>
          <p className="text-gray-600 mt-1">Register a new SaaS customer</p>
        </div>
      </div>

      {/* Form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Tenant Information</CardTitle>
          <CardDescription>Enter the details for the new tenant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Company Name *</label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Acme Travel Co."
                required
              />
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Email *</label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="contact@acme.com"
                required
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Phone</label>
              <Input
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                placeholder="+1 (555) 000-0000"
              />
            </div>

            {/* Business Type */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Business Type</label>
              <Input
                name="businessType"
                value={formData.businessType}
                onChange={handleChange}
                placeholder="Travel Agency, Tour Operator, etc."
              />
            </div>

            {/* Website */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Website</label>
              <Input
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                placeholder="https://acme.com"
              />
            </div>

            {/* Plan Selection */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Subscription Plan *</label>
              <Select
                value={formData.planId}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    planId: value,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter - $99/month</SelectItem>
                  <SelectItem value="professional">Professional - $299/month</SelectItem>
                  <SelectItem value="enterprise">Enterprise - $999/month</SelectItem>
                  <SelectItem value="custom">Custom - Contact Sales</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error.message}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4">
              <Link href="/super-admin/tenants">
                <Button variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Tenant'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
