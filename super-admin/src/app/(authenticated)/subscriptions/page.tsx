'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { StatCard } from '@/components/shared/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CreditCard,
  TrendingUp,
  DollarSign,
  Users,
  MoreHorizontal,
  ArrowUpDown,
  XCircle,
  Plus,
} from 'lucide-react';

interface SubRow {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  plan: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  trial_ends_at: string;
}

interface Revenue {
  mrr: number;
  arr: number;
  active_count: number;
  arpt: number;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  past_due: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  expired: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
};

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [revenue, setRevenue] = useState<Revenue>({ mrr: 0, arr: 0, active_count: 0, arpt: 0 });
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [paymentDialog, setPaymentDialog] = useState<{ open: boolean; subId: string }>({ open: false, subId: '' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'bank_transfer', reference: '', notes: '' });

  const fetchSubs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set('status', statusFilter);
    const res = await fetch(`/api/subscriptions?${params}`);
    const data = (await res.json()) as { subscriptions: SubRow[]; totalPages: number; revenue: Revenue };
    setSubs(data.subscriptions || []);
    setTotalPages(data.totalPages || 1);
    setRevenue(data.revenue);
    setLoading(false);
  }, [page, statusFilter]);

  useEffect(() => { fetchSubs(); }, [fetchSubs]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const handleRecordPayment = async () => {
    await fetch(`/api/subscriptions/${paymentDialog.subId}/record-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        reference: paymentForm.reference,
        notes: paymentForm.notes,
      }),
    });
    setPaymentDialog({ open: false, subId: '' });
    setPaymentForm({ amount: '', method: 'bank_transfer', reference: '', notes: '' });
    fetchSubs();
  };

  const handleCancel = async (subId: string) => {
    const reason = prompt('Reason for cancellation:');
    if (!reason) return;
    await fetch(`/api/subscriptions/${subId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, immediate: false }),
    });
    fetchSubs();
  };

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Subscriptions' }]} />
      <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="MRR" value={`₹${revenue.mrr.toLocaleString('en-IN')}`} icon={<CreditCard className="h-4 w-4" />} />
        <StatCard title="ARR" value={`₹${revenue.arr.toLocaleString('en-IN')}`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard title="Active Subs" value={revenue.active_count} icon={<Users className="h-4 w-4" />} />
        <StatCard title="Avg Revenue/Tenant" value={`₹${(revenue.arpt || 0).toLocaleString('en-IN')}`} icon={<DollarSign className="h-4 w-4" />} />
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="trial">Trial</TabsTrigger>
          <TabsTrigger value="past_due">Past Due</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-3 px-4 font-medium">Tenant</th>
              <th className="text-left py-3 px-4 font-medium">Plan</th>
              <th className="text-right py-3 px-4 font-medium">Amount</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Next Billing</th>
              <th className="text-right py-3 px-4 font-medium w-12" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
                  ))}
                </tr>
              ))
            ) : subs.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No subscriptions found</td></tr>
            ) : (
              subs.map((s) => (
                <tr key={s.id} className="border-b hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <Link href={`/tenants/${s.tenant_id}`} className="font-medium hover:underline">{s.tenant_name}</Link>
                    <p className="text-xs text-muted-foreground">{s.tenant_slug}</p>
                  </td>
                  <td className="py-3 px-4 capitalize">{s.plan}</td>
                  <td className="py-3 px-4 text-right">₹{(s.amount || 0).toLocaleString('en-IN')}/{s.billing_cycle === 'yearly' ? 'yr' : 'mo'}</td>
                  <td className="py-3 px-4">
                    <Badge variant="outline" className={statusColors[s.status] || ''}>{s.status}</Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {s.next_billing_date ? new Date(s.next_billing_date).toLocaleDateString() : s.trial_ends_at ? `Trial ends ${new Date(s.trial_ends_at).toLocaleDateString()}` : '—'}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPaymentDialog({ open: true, subId: s.id })}>
                          <Plus className="mr-2 h-4 w-4" /> Record Payment
                        </DropdownMenuItem>
                        {s.status !== 'cancelled' && (
                          <DropdownMenuItem onClick={() => handleCancel(s.id)} className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" /> Cancel
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        )}
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={paymentDialog.open} onOpenChange={(open) => setPaymentDialog({ ...paymentDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Manual Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="999" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Method</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Reference</label>
              <Input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} placeholder="Transaction ID" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Notes</label>
              <Input value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog({ open: false, subId: '' })}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={!paymentForm.amount}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
