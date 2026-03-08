'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery, usePaginatedQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { AlertCircle, RefreshCw, Search, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SystemHealth {
  status: 'healthy' | 'warning' | 'critical';
  uptime: number;
  responseTime: number;
  cpuUsage: number;
  memoryUsage: number;
  databaseConnection: boolean;
  cacheHealth: string;
  metrics: { timestamp: string; cpu: number; memory: number; responseTime: number }[];
  recentErrors: SystemLog[];
}

interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  service: string;
  message: string;
  details?: string;
}

export default function SystemPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'critical'>('all');
  const [activeTab, setActiveTab] = useState<'health' | 'logs'>('health');

  const { data: health, loading: healthLoading, error: healthError, refetch: refetchHealth } = useApiQuery<SystemHealth>(
    async () => {
      const response = await client.get<{ data: SystemHealth }>(API_ENDPOINTS.admin.systemHealth);
      return response.data;
    },
  );

  const {
    data: logs,
    pagination,
    loading: logsLoading,
    setPage,
  } = usePaginatedQuery<SystemLog>(
    async (page, limit) => {
      const response = await client.get<{ data: SystemLog[]; pagination: any }>(API_ENDPOINTS.admin.systemLogs, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
          level: levelFilter !== 'all' ? levelFilter : undefined,
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'info':
        return 'bg-blue-100 text-blue-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'critical':
        return 'bg-red-200 text-red-900';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (healthError && !healthLoading && activeTab === 'health') {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading System Health</h1>
          <p className="text-gray-600 mt-2">{healthError.message}</p>
        </div>
        <Button onClick={() => refetchHealth()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-gray-600 mt-1">Platform monitoring and logs</p>
        </div>
        {activeTab === 'health' && (
          <Button onClick={() => refetchHealth()} disabled={healthLoading} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['health', 'logs'] as const).map((tab: any) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Health Overview */}
      {activeTab === 'health' && (
        <>
          {/* Status Card */}
          <Card className={getStatusColor(health?.status ?? '')}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {health?.status === 'healthy' && <CheckCircle className="w-5 h-5" />}
                  {health?.status === 'warning' && <AlertTriangle className="w-5 h-5" />}
                  {health?.status === 'critical' && <AlertCircle className="w-5 h-5" />}
                  Overall Status
                </CardTitle>
                <span className="text-sm font-semibold capitalize">{health?.status ?? 'unknown'}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm">Last updated: {new Date().toLocaleTimeString()}</p>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Uptime</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{healthLoading ? '-' : `${health?.uptime ?? 0}%`}</p>
                <p className="text-xs text-gray-500">Platform availability</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Response Time</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{healthLoading ? '-' : `${health?.responseTime ?? 0}ms`}</p>
                <p className="text-xs text-gray-500">Average latency</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">CPU Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{healthLoading ? '-' : `${health?.cpuUsage ?? 0}%`}</p>
                <p className="text-xs text-gray-500">Current load</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Memory Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{healthLoading ? '-' : `${health?.memoryUsage ?? 0}%`}</p>
                <p className="text-xs text-gray-500">Current allocation</p>
              </CardContent>
            </Card>
          </div>

          {/* Services Status */}
          <Card>
            <CardHeader>
              <CardTitle>Service Status</CardTitle>
              <CardDescription>Individual service health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-semibold">Database Connection</p>
                  <p className="text-sm text-gray-600">PostgreSQL Connection</p>
                </div>
                {healthLoading ? (
                  <span className="text-gray-500">Checking...</span>
                ) : (
                  <span className={`flex items-center gap-2 ${health?.databaseConnection ? 'text-green-600' : 'text-red-600'}`}>
                    {health?.databaseConnection ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                    {health?.databaseConnection ? 'Connected' : 'Disconnected'}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-semibold">Cache Service</p>
                  <p className="text-sm text-gray-600">Redis/Cache Layer</p>
                </div>
                {healthLoading ? (
                  <span className="text-gray-500">Checking...</span>
                ) : (
                  <span className="text-green-600 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    {health?.cacheHealth ?? 'Healthy'}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          {health?.metrics && health.metrics.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>System metrics over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={health.metrics}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="cpu" stackId="1" stroke="#ef4444" fill="#fecaca" name="CPU %" />
                    <Area type="monotone" dataKey="memory" stackId="1" stroke="#3b82f6" fill="#93c5fd" name="Memory %" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Recent Errors */}
          {health?.recentErrors && health.recentErrors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Errors</CardTitle>
                <CardDescription>Latest system errors and warnings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {health.recentErrors.slice(0, 5).map((error: any) => (
                    <div key={error.id} className="p-3 border rounded-lg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getLogLevelColor(error.level)}`}>
                              {error.level.toUpperCase()}
                            </span>
                            <span className="text-sm font-mono text-gray-600">{error.service}</span>
                          </div>
                          <p className="text-sm font-medium mt-1">{error.message}</p>
                          {error.details && <p className="text-xs text-gray-600 mt-1">{error.details}</p>}
                        </div>
                        <time className="text-xs text-gray-500 flex-shrink-0">
                          {new Date(error.timestamp).toLocaleTimeString()}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Logs */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>System Logs</CardTitle>
            <CardDescription>Complete system event log</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={handleSearch}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {(['all', 'info', 'warning', 'error', 'critical'] as const).map((level: any) => (
                  <Button
                    key={level}
                    variant={levelFilter === level ? 'default' : 'outline'}
                    onClick={() => {
                      setLevelFilter(level);
                      setPage(1);
                    }}
                    className="capitalize"
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </div>

            {/* Logs List */}
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-gray-500">No logs found</div>
            ) : (
              <>
                <div className="space-y-3">
                  {logs.map((log: any) => (
                    <div key={log.id} className="p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getLogLevelColor(log.level)}`}>
                              {log.level.toUpperCase()}
                            </span>
                            <span className="text-sm font-mono text-gray-600">{log.service}</span>
                            <time className="text-xs text-gray-500 ml-auto">
                              {new Date(log.timestamp).toLocaleString()}
                            </time>
                          </div>
                          <p className="text-sm font-medium">{log.message}</p>
                          {log.details && <p className="text-xs text-gray-600 mt-2 font-mono">{log.details}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
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
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
