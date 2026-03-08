'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiMutation, usePaginatedQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';
import { Search, MoreVertical, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: 'admin' | 'user' | 'superadmin';
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  lastLogin?: string;
}

export default function AllUsersPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user' | 'superadmin'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const {
    data: users,
    pagination,
    loading,
    error,
    setPage,
    refetch,
  } = usePaginatedQuery<AdminUser>(
    async (page, limit) => {
      const response = await client.get<{ data: AdminUser[]; pagination: any }>(API_ENDPOINTS.admin.allUsers, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
          role: roleFilter !== 'all' ? roleFilter : undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        },
      });
      return {
        data: response.data,
        pagination: response.pagination,
      };
    },
    1,
    15,
  );

  const suspendMutation = useApiMutation<string, void>(async (userId) => {
    await client.post(API_ENDPOINTS.admin.userSuspend(userId));
  });

  const activateMutation = useApiMutation<string, void>(async (userId) => {
    await client.post(API_ENDPOINTS.admin.userActivate(userId));
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleSuspend = async (user: AdminUser) => {
    if (!confirm(`Suspend ${user.name}? They will lose access to the system.`)) {
      return;
    }

    await suspendMutation.mutate(user.id);
    if (!suspendMutation.error) {
      toast.success('User suspended successfully');
      refetch();
    } else {
      toast.error(suspendMutation.error.message);
    }
  };

  const handleActivate = async (user: AdminUser) => {
    if (!confirm(`Activate ${user.name}?`)) {
      return;
    }

    await activateMutation.mutate(user.id);
    if (!activateMutation.error) {
      toast.success('User activated successfully');
      refetch();
    } else {
      toast.error(activateMutation.error.message);
    }
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Users</h1>
          <p className="text-gray-600 mt-2">{error.message}</p>
        </div>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">All Users</h1>
        <p className="text-gray-600 mt-1">Manage users across all tenants</p>
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
              {(['all', 'admin', 'user', 'superadmin'] as const).map((role: any) => (
                <Button
                  key={role}
                  variant={roleFilter === role ? 'default' : 'outline'}
                  onClick={() => {
                    setRoleFilter(role);
                    setPage(1);
                  }}
                  className="capitalize"
                >
                  {role === 'superadmin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users List</CardTitle>
          <CardDescription>
            Showing {users.length} of {pagination.total} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading users...</div>
            </div>
          ) : users.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">No users found</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Tenant</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Role</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Last Login</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
                      <td className="px-4 py-3 text-sm">{user.tenantName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-blue-100 text-blue-800 capitalize">
                          {user.role === 'superadmin' ? 'Super Admin' : user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : user.status === 'suspended'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedUser(user);
                                setShowDetailDialog(true);
                              }}
                            >
                              View Details
                            </DropdownMenuItem>
                            {user.status === 'active' && (
                              <DropdownMenuItem onClick={() => handleSuspend(user)} className="text-red-600">
                                Suspend
                              </DropdownMenuItem>
                            )}
                            {user.status !== 'active' && (
                              <DropdownMenuItem onClick={() => handleActivate(user)}>
                                Activate
                              </DropdownMenuItem>
                            )}
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

      {/* User Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedUser?.name}</DialogTitle>
            <DialogDescription>{selectedUser?.email}</DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">Tenant</p>
                <p className="font-semibold">{selectedUser.tenantName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Role</p>
                <p className="font-semibold capitalize">
                  {selectedUser.role === 'superadmin' ? 'Super Admin' : selectedUser.role}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-semibold capitalize">{selectedUser.status}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Joined</p>
                <p className="font-semibold">{new Date(selectedUser.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Last Login</p>
                <p className="font-semibold">
                  {selectedUser.lastLogin ? new Date(selectedUser.lastLogin).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
