'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, AlertCircle, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features: string[];
  maxUsers?: number;
  maxContacts?: number;
  maxTeam?: number;
  isActive: boolean;
  createdAt: string;
}

export default function PlansPage() {
  const [isAddingPlan, setIsAddingPlan] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [formData, setFormData] = useState<Partial<Plan>>({
    name: '',
    description: '',
    price: 0,
    billingCycle: 'monthly',
    features: [],
    isActive: true,
  });

  const { data: plans, loading, error, refetch } = useApiQuery<Plan[]>(
    async () => {
      const response = await client.get<{ data: Plan[] }>(API_ENDPOINTS.admin.plans);
      return response.data;
    },
  );

  const createMutation = useApiMutation<Partial<Plan>, Plan>(async (data) => {
    const response = await client.post<{ data: Plan }>(API_ENDPOINTS.admin.planCreate, data);
    return response.data;
  });

  const updateMutation = useApiMutation<Partial<Plan>, Plan>(async (data) => {
    if (!editingPlan?.id) throw new Error('No plan selected');
    const response = await client.put<{ data: Plan }>(API_ENDPOINTS.admin.planUpdate(editingPlan.id), data);
    return response.data;
  });

  const deleteMutation = useApiMutation<string, void>(async (planId) => {
    await client.delete(API_ENDPOINTS.admin.planDelete(planId));
  });

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      toast.error('Please fill in required fields');
      return;
    }

    if (editingPlan) {
      await updateMutation.mutate(formData);
      if (!updateMutation.error) {
        toast.success('Plan updated successfully');
        setEditingPlan(null);
        setFormData({
          name: '',
          description: '',
          price: 0,
          billingCycle: 'monthly',
          features: [],
          isActive: true,
        });
        refetch();
      } else {
        toast.error(updateMutation.error.message);
      }
    } else {
      await createMutation.mutate(formData);
      if (!createMutation.error) {
        toast.success('Plan created successfully');
        setIsAddingPlan(false);
        setFormData({
          name: '',
          description: '',
          price: 0,
          billingCycle: 'monthly',
          features: [],
          isActive: true,
        });
        refetch();
      } else {
        toast.error(createMutation.error.message);
      }
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) {
      return;
    }

    await deleteMutation.mutate(planId);
    if (!deleteMutation.error) {
      toast.success('Plan deleted successfully');
      refetch();
    } else {
      toast.error(deleteMutation.error.message);
    }
  };

  const openEditDialog = (plan: Plan) => {
    setEditingPlan(plan);
    setFormData(plan);
    setIsAddingPlan(true);
  };

  const closeDialog = () => {
    setIsAddingPlan(false);
    setEditingPlan(null);
    setFormData({
      name: '',
      description: '',
      price: 0,
      billingCycle: 'monthly',
      features: [],
      isActive: true,
    });
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Plans</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Subscription Plans</h1>
          <p className="text-gray-600 mt-1">Manage SaaS pricing tiers</p>
        </div>
        <Dialog open={isAddingPlan} onOpenChange={(open) => !open && closeDialog()}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              New Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingPlan ? 'Edit Plan' : 'Create New Plan'}</DialogTitle>
              <DialogDescription>
                {editingPlan ? 'Update plan details' : 'Add a new subscription plan'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Plan Name *</label>
                <Input
                  value={formData.name ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Starter"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">Description</label>
                <Textarea
                  value={formData.description ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Plan description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Price (USD) *</label>
                  <Input
                    type="number"
                    value={formData.price ?? 0}
                    onChange={(e) => setFormData((prev) => ({ ...prev, price: parseFloat(e.target.value) }))}
                    placeholder="99"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Billing Cycle</label>
                  <select
                    value={formData.billingCycle ?? 'monthly'}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        billingCycle: e.target.value as 'monthly' | 'yearly',
                      }))
                    }
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold">Max Users</label>
                  <Input
                    type="number"
                    value={formData.maxUsers ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxUsers: e.target.value ? parseInt(e.target.value) : undefined,
                      }))
                    }
                    placeholder="Unlimited"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Max Contacts</label>
                  <Input
                    type="number"
                    value={formData.maxContacts ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxContacts: e.target.value ? parseInt(e.target.value) : undefined,
                      }))
                    }
                    placeholder="Unlimited"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Max Team Members</label>
                  <Input
                    type="number"
                    value={formData.maxTeam ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxTeam: e.target.value ? parseInt(e.target.value) : undefined,
                      }))
                    }
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={createMutation.loading || updateMutation.loading}>
                  {editingPlan ? 'Update Plan' : 'Create Plan'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading plans...</div>
        </div>
      ) : plans && plans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan: any) => (
            <Card key={plan.id} className={!plan.isActive ? 'opacity-60' : ''}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </div>
                  {!plan.isActive && <span className="text-xs bg-gray-100 px-2 py-1 rounded">Inactive</span>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Price */}
                <div>
                  <p className="text-3xl font-bold">${plan.price}</p>
                  <p className="text-sm text-gray-600">per {plan.billingCycle}</p>
                </div>

                {/* Limits */}
                <div className="space-y-2">
                  {plan.maxUsers && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500" />
                      Up to {plan.maxUsers} users
                    </div>
                  )}
                  {plan.maxContacts && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500" />
                      Up to {plan.maxContacts} contacts
                    </div>
                  )}
                  {plan.maxTeam && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500" />
                      Up to {plan.maxTeam} team members
                    </div>
                  )}
                </div>

                {/* Features */}
                {plan.features && plan.features.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-600">Features</p>
                    <ul className="text-xs space-y-1">
                      {plan.features.slice(0, 3).map((feature: any, idx: number) => (
                        <li key={idx} className="flex items-center gap-2">
                          <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                          {feature}
                        </li>
                      ))}
                      {plan.features.length > 3 && (
                        <li className="text-gray-500">+{plan.features.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEditDialog(plan)}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-gray-600">No plans found. Create one to get started.</p>
              <Button className="mt-4 gap-2">
                <Plus className="w-4 h-4" />
                Create First Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
