'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery, useApiMutation, usePaginatedQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, MoreVertical, ChevronLeft, ChevronRight, AlertCircle, CheckCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Link from 'next/link';

interface Tenant {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended' | 'inactive';
  createdAt: string;
  subscription?: {
    plan: string;
    status: 'active' | 'cancelled' | 'expired';
  };
  userCount?: number;
}

export default function TenantsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'inactive'>('all');

  const {
    data: tenants,
    pagination,
    loading,
    error,
    setPage,
    setLimit,
    refetch,
  } = usePaginatedQuery<Tenant>(
    async (page, limit) => {
      const response = await client.get<{ data: Tenant[]; pagination: any }>(API_ENDPOINTS.admin.tenants, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        },
      });
      return {
        data: response.data,
        pagination: response.pagination,
      };
    },
    1,
    10,
  );

  const deleteMutation = useApiMutation<string, void>(async (tenantId) => {
    await client.delete(API_ENDPOINTS.admin.tenantById(tenantId));
  });

  const handleDelete = async (tenantId: string) => {
    if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
      return;
    }

    await deleteMutation.mutate(tenantId);
    if (!deleteMutation.error) {
      toast.success('Tenant deleted successfully');
      refetch();
    } else {
      toast.error(deleteMutation.error.message);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Tenants</h1>
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
          <h1 className="text-3xl font-bold">Tenants Management</h1>
          <p className="text-gray-600 mt-1">Manage all SaaS customers</p>
        </div>
        <Link href="/super-admin/tenants/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Tenant
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {(['all', 'active', 'suspended', 'inactive'] as const).map((status: any) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  onClick={() => {
                    setStatusFilter(status);
                    setPage(1);
                  }}
                  className="capitalize"
                >
                  {status}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Tenants List</CardTitle>
          <CardDescription>
            Showing {tenants.length} of {pagination.total} tenants
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading tenants...</div>
            </div>
          ) : tenants.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">No tenants found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Plan</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Users</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Created</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant: any) => (
                    <tr key={tenant.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{tenant.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{tenant.email}</td>
                      <td className="px-4 py-3 text-sm">{tenant.subscription?.plan ?? 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">{tenant.userCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${
                            tenant.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : tenant.status === 'suspended'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {tenant.status === 'active' && <CheckCircle className="w-3 h-3" />}
                          {tenant.status === 'suspended' && <AlertCircle className="w-3 h-3" />}
                          {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{new Date(tenant.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/super-admin/tenants/${tenant.id}`} className="flex items-center gap-2">
                                <Edit2 className="w-4 h-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(tenant.id)} className="text-red-600">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <div className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, pagination.page - 1))}
                  disabled={pagination.page === 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.min(pagination.totalPages, pagination.page + 1))}
                  disabled={pagination.page === pagination.totalPages}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
