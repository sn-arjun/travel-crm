'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaginatedQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { Search, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  tenantId?: string;
  tenantName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  resourceName?: string;
  changes?: Record<string, { before: any; after: any }>;
  ipAddress: string;
  userAgent?: string;
  status: 'success' | 'failure';
}

export default function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | 'create' | 'update' | 'delete' | 'login'>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);

  const {
    data: logs,
    pagination,
    loading,
    error,
    setPage,
    refetch,
  } = usePaginatedQuery<AuditLog>(
    async (page, limit) => {
      const response = await client.get<{ data: AuditLog[]; pagination: any }>(API_ENDPOINTS.admin.auditLogs, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
          action: actionFilter !== 'all' ? actionFilter : undefined,
        },
      });
      return {
        data: response.data,
        pagination: response.pagination,
      };
    },
    1,
    20,
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (error && !loading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Audit Logs</h1>
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
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-gray-600 mt-1">Complete system activity and user action history</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by user, tenant, or action..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {(['all', 'create', 'update', 'delete', 'login'] as const).map((action: any) => (
                <Button
                  key={action}
                  variant={actionFilter === action ? 'default' : 'outline'}
                  onClick={() => {
                    setActionFilter(action);
                    setPage(1);
                  }}
                  className="capitalize"
                >
                  {action}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            Showing {logs.length} of {pagination.total} entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading audit logs...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">No audit logs found</div>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log: any) => (
                <div
                  key={log.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => {
                    setSelectedLog(log);
                    setShowDetailDialog(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getActionColor(log.action)}`}>
                          {log.action.toUpperCase()}
                        </span>
                        <span className="text-sm font-semibold">{log.resourceType}</span>
                        {log.resourceName && <span className="text-sm text-gray-600">{log.resourceName}</span>}
                        <span
                          className={`ml-auto inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>User: <span className="font-semibold">{log.userName}</span></span>
                        {log.tenantName && <span>Tenant: <span className="font-semibold">{log.tenantName}</span></span>}
                        <time>{new Date(log.timestamp).toLocaleString()}</time>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>{selectedLog?.id}</DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Action</p>
                  <p className="font-semibold">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Resource Type</p>
                  <p className="font-semibold">{selectedLog.resourceType}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">User</p>
                  <p className="font-semibold">{selectedLog.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Timestamp</p>
                  <p className="font-semibold">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                </div>
              </div>

              {selectedLog.tenantName && (
                <div>
                  <p className="text-sm text-gray-600">Tenant</p>
                  <p className="font-semibold">{selectedLog.tenantName}</p>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600">IP Address</p>
                <p className="font-mono text-sm">{selectedLog.ipAddress}</p>
              </div>

              {selectedLog.userAgent && (
                <div>
                  <p className="text-sm text-gray-600">User Agent</p>
                  <p className="font-mono text-xs break-words">{selectedLog.userAgent}</p>
                </div>
              )}

              {selectedLog.changes && Object.keys(selectedLog.changes).length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Changes</p>
                  <div className="space-y-2">
                    {Object.entries(selectedLog.changes).map(([field, change]) => (
                      <div key={field} className="p-3 bg-gray-50 rounded border">
                        <p className="text-sm font-semibold text-gray-700">{field}</p>
                        <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                          <div>
                            <p className="text-gray-600">Before</p>
                            <p className="font-mono">{JSON.stringify(change.before)}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">After</p>
                            <p className="font-mono">{JSON.stringify(change.after)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-sm font-semibold text-gray-700">Status</p>
                <span
                  className={`inline-block mt-2 px-3 py-1 rounded text-sm font-semibold ${
                    selectedLog.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {selectedLog.status.charAt(0).toUpperCase() + selectedLog.status.slice(1)}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
