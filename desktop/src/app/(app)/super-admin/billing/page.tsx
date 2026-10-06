'use client';

import * as React from 'react';
import { ListPage } from '@/components/domain';
import type { DataTableColumn } from '@/components/ui/data-table';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/domain';
import { LineChart } from '@/components/ui/chart';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, TrendingUp, Users } from 'lucide-react';
import { useApiQuery } from '@/hooks/use-api';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { PageContainer } from '@/components/layout/page-container';

interface BillingStats {
  totalRevenue: number;
  monthlyRecurring: number;
  activeSubscriptions: number;
  churnRate: number;
  revenueByMonth: { month: string; revenue: number }[];
}

interface Invoice {
  id: string;
  tenantId: string;
  tenantName: string;
  amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  issueDate: string;
  dueDate: string;
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

function invoiceTone(status: Invoice['status']) {
  if (status === 'paid') return 'success' as const;
  if (status === 'overdue') return 'danger' as const;
  if (status === 'cancelled') return 'info' as const;
  return 'warning' as const;
}

function paymentTone(status: Payment['status']) {
  if (status === 'completed') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'refunded') return 'warning' as const;
  return 'info' as const;
}

const currency = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function BillingPageContent() {
  const { data: stats, loading: statsLoading } = useApiQuery<BillingStats>(async () => {
    const response = await client.get<{ data: BillingStats }>(API_ENDPOINTS.admin.billingStats);
    return response.data;
  }, []);

  const [invoiceStatus, setInvoiceStatus] = React.useState<'all' | 'paid' | 'overdue' | 'sent' | 'draft' | 'cancelled'>('all');

  const invoiceColumns: DataTableColumn<Invoice>[] = [
    { key: 'id', header: 'Invoice ID', cell: (i) => <span className="font-mono text-xs">{i.id}</span> },
    { key: 'tenantName', header: 'Tenant', hideable: false },
    { key: 'amount', header: 'Amount', align: 'right', cell: (i) => currency(i.amount) },
    { key: 'status', header: 'Status', cell: (i) => <Tag tone={invoiceTone(i.status)}>{i.status}</Tag> },
    { key: 'issueDate', header: 'Issue date', cell: (i) => new Date(i.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
    { key: 'dueDate', header: 'Due date', cell: (i) => (i.dueDate ? new Date(i.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—') },
  ];

  const paymentColumns: DataTableColumn<Payment>[] = [
    { key: 'id', header: 'Payment ID', cell: (p) => <span className="font-mono text-xs">{p.id}</span> },
    { key: 'tenantName', header: 'Tenant', hideable: false },
    { key: 'amount', header: 'Amount', align: 'right', cell: (p) => currency(p.amount) },
    { key: 'method', header: 'Method', cell: (p) => <span className="capitalize">{p.method}</span> },
    { key: 'status', header: 'Status', cell: (p) => <Tag tone={paymentTone(p.status)}>{p.status}</Tag> },
    { key: 'processedAt', header: 'Date', cell: (p) => new Date(p.processedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <PageHeader title="Billing & revenue" description="Platform-wide financial overview." />

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-4">
        <StatCard title="Total revenue" value={currency(stats?.totalRevenue ?? 0)} icon={<DollarSign />} loading={statsLoading} />
        <StatCard title="MRR" value={currency(stats?.monthlyRecurring ?? 0)} icon={<TrendingUp />} loading={statsLoading} />
        <StatCard title="Active subscriptions" value={stats?.activeSubscriptions ?? 0} icon={<Users />} loading={statsLoading} />
        <StatCard title="Churn rate" value={`${stats?.churnRate ?? 0}%`} icon={<TrendingUp />} loading={statsLoading} />
      </div>

      <div className="rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4">
        <h3 className="mb-ds-3 text-sm font-semibold text-ds-foreground">Revenue trend</h3>
        <LineChart
          data={stats?.revenueByMonth ?? []}
          categoryKey="month"
          series={[{ dataKey: 'revenue', label: 'Revenue' }]}
          loading={statsLoading}
          valueFormatter={currency}
        />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-ds-4">
          <ListPage<Invoice>
            className="p-0"
            title="Invoices"
            getRowId={(i) => i.id}
            fetcher={({ page, limit, search }) =>
              client.get(API_ENDPOINTS.admin.invoices, {
                params: { page, limit, search: search || undefined, status: invoiceStatus !== 'all' ? invoiceStatus : undefined },
              })
            }
            extractItems={(r) => (r as { data?: Invoice[] })?.data ?? []}
            extractTotal={(r) => (r as { pagination?: { total?: number } })?.pagination?.total ?? 0}
            columns={invoiceColumns}
            searchPlaceholder="Search by tenant name..."
            filters={invoiceStatus !== 'all' ? [{ id: 'status', label: 'Status', value: invoiceStatus }] : []}
            onRemoveFilter={() => setInvoiceStatus('all')}
            onClearFilters={() => setInvoiceStatus('all')}
            headerActions={
              <Select value={invoiceStatus} onValueChange={(v) => setInvoiceStatus(v as typeof invoiceStatus)}>
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            }
            emptyTitle="No invoices found"
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-ds-4">
          <ListPage<Payment>
            className="p-0"
            title="Payments"
            getRowId={(p) => p.id}
            fetcher={({ page, limit, search }) =>
              client.get(API_ENDPOINTS.admin.payments, { params: { page, limit, search: search || undefined } })
            }
            extractItems={(r) => (r as { data?: Payment[] })?.data ?? []}
            extractTotal={(r) => (r as { pagination?: { total?: number } })?.pagination?.total ?? 0}
            columns={paymentColumns}
            searchPlaceholder="Search by tenant name..."
            emptyTitle="No payments found"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function BillingPage() {
  return (
    <PageContainer>
      <BillingPageContent />
    </PageContainer>
  );
}
