'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiQuery, usePaginatedQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { AlertCircle, Download, Search, ChevronLeft, ChevronRight, TrendingUp, DollarSign, Users } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface BillingStats {
  totalRevenue: number;
  monthlyRecurring: number;
  activeSubscriptions: number;
  churnRate: number;
  revenueByMonth: { month: string; revenue: number }[];
  invoices: Invoice[];
  payments: Payment[];
}

interface Invoice {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
  paidDate?: string;
}

interface Payment {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  method: string;
  processedAt: string;
}

export default function BillingPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payments'>('overview');

  const { data: stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useApiQuery<BillingStats>(
    async () => {
      const response = await client.get<{ data: BillingStats }>(API_ENDPOINTS.admin.billing);
      return response.data;
    },
  );

  const {
    data: invoices,
    pagination: invoicePagination,
    loading: invoicesLoading,
    setPage: setInvoicePage,
  } = usePaginatedQuery<Invoice>(
    async (page, limit) => {
      const response = await client.get<{ data: Invoice[]; pagination: any }>(API_ENDPOINTS.admin.invoices, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
          status: invoiceStatusFilter !== 'all' ? invoiceStatusFilter : undefined,
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

  const {
    data: payments,
    pagination: paymentPagination,
    loading: paymentsLoading,
    setPage: setPaymentPage,
  } = usePaginatedQuery<Payment>(
    async (page, limit) => {
      const response = await client.get<{ data: Payment[]; pagination: any }>(API_ENDPOINTS.admin.payments, {
        params: {
          page,
          limit,
          search: searchTerm || undefined,
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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setInvoicePage(1);
    setPaymentPage(1);
  };

  if (statsError && !statsLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error Loading Billing Data</h1>
          <p className="text-gray-600 mt-2">{statsError.message}</p>
        </div>
        <Button onClick={() => refetchStats()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Billing & Revenue</h1>
        <p className="text-gray-600 mt-1">Platform financial overview</p>
      </div>

      {/* Key Metrics */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-8 h-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      ${statsLoading ? '-' : (stats?.totalRevenue ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">All Time</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">MRR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-blue-500" />
                  <div>
                    <p className="text-2xl font-bold">
                      ${statsLoading ? '-' : (stats?.monthlyRecurring ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Monthly Recurring</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Active Subscriptions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-purple-500" />
                  <div>
                    <p className="text-2xl font-bold">{statsLoading ? '-' : stats?.activeSubscriptions ?? 0}</p>
                    <p className="text-xs text-gray-500">Active Plans</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-gray-600">Churn Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-8 h-8 text-red-500" />
                  <div>
                    <p className="text-2xl font-bold">{statsLoading ? '-' : `${stats?.churnRate ?? 0}%`}</p>
                    <p className="text-xs text-gray-500">Monthly</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Monthly revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="h-64 flex items-center justify-center text-gray-400">Loading...</div>
              ) : stats?.revenueByMonth && stats.revenueByMonth.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={stats.revenueByMonth}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => {
                      if (typeof value === 'number') return `$${value.toLocaleString()}`;
                      return value;
                    }} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#10b981" name="Revenue" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">No data available</div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['overview', 'invoices', 'payments'] as const).map((tab: any) => (
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

      {/* Invoices */}
      {activeTab === 'invoices' && (
        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Tenant invoices and billing records</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search by tenant name..."
                    value={searchTerm}
                    onChange={handleSearch}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {(['all', 'paid', 'overdue', 'sent', 'draft'] as const).map((status: any) => (
                  <Button
                    key={status}
                    variant={invoiceStatusFilter === status ? 'default' : 'outline'}
                    onClick={() => {
                      setInvoiceStatusFilter(status);
                      setInvoicePage(1);
                    }}
                    className="capitalize"
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </div>

            {/* Table */}
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-8">Loading...</div>
            ) : invoices.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">No invoices found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left text-sm font-semibold">Invoice ID</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Tenant</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Amount</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Issue Date</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Due Date</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice: any) => (
                        <tr key={invoice.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-sm">{invoice.id}</td>
                          <td className="px-4 py-3 font-medium">{invoice.tenantName}</td>
                          <td className="px-4 py-3 font-semibold">${invoice.amount.toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                                invoice.status === 'paid'
                                  ? 'bg-green-100 text-green-800'
                                  : invoice.status === 'overdue'
                                    ? 'bg-red-100 text-red-800'
                                    : invoice.status === 'sent'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{new Date(invoice.issueDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-sm">{new Date(invoice.dueDate).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            <Button variant="ghost" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {invoicePagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      Page {invoicePagination.page} of {invoicePagination.totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setInvoicePage(Math.max(1, invoicePagination.page - 1))}
                        disabled={invoicePagination.page === 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setInvoicePage(Math.min(invoicePagination.totalPages, invoicePagination.page + 1))
                        }
                        disabled={invoicePagination.page === invoicePagination.totalPages}
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

      {/* Payments */}
      {activeTab === 'payments' && (
        <Card>
          <CardHeader>
            <CardTitle>Payments</CardTitle>
            <CardDescription>Payment records and transaction history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search */}
            <div className="flex-1 min-w-64">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search by tenant name..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Table */}
            {paymentsLoading ? (
              <div className="flex items-center justify-center py-8">Loading...</div>
            ) : payments.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">No payments found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="px-4 py-2 text-left text-sm font-semibold">Payment ID</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Tenant</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Amount</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Method</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Status</th>
                        <th className="px-4 py-2 text-left text-sm font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((payment: any) => {
                        const paymentStatus = payment.status ?? 'pending';
                        return (
                        <tr key={payment.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-sm">{payment.id}</td>
                          <td className="px-4 py-3 font-medium">{payment.tenantName}</td>
                          <td className="px-4 py-3 font-semibold">${payment.amount.toLocaleString()}</td>
                          <td className="px-4 py-3 text-sm capitalize">{payment.method}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                                paymentStatus === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : paymentStatus === 'failed'
                                    ? 'bg-red-100 text-red-800'
                                    : paymentStatus === 'refunded'
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{new Date(payment.processedAt).toLocaleDateString()}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {paymentPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <div className="text-sm text-gray-600">
                      Page {paymentPagination.page} of {paymentPagination.totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPaymentPage(Math.max(1, paymentPagination.page - 1))}
                        disabled={paymentPagination.page === 1}
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPaymentPage(Math.min(paymentPagination.totalPages, paymentPagination.page + 1))
                        }
                        disabled={paymentPagination.page === paymentPagination.totalPages}
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
