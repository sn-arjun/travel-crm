'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Star, Phone, Mail, MapPin, Building2, CreditCard, FileText, Loader2,
  AlertCircle, Edit, Trash2, Heart, DollarSign, TrendingUp, Clock, BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { suppliersApi, type SupplierRateCard, type SupplierPayment, type SupplierLedger } from '@/lib/api/suppliers';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function SupplierDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);

  const { data: supplierResponse, loading, error, refetch } = useApiQuery(
    () => suppliersApi.getById(supplierId),
    [supplierId],
  );

  const { data: rateCardsResponse } = useApiQuery(
    () => suppliersApi.getRateCards(supplierId),
    [supplierId],
  );

  const { data: paymentsResponse } = useApiQuery(
    () => suppliersApi.getPayments(supplierId),
    [supplierId],
  );

  const { data: ledgerResponse } = useApiQuery(
    () => suppliersApi.getLedger(supplierId),
    [supplierId],
  );

  const { mutate: deleteSupplier, loading: isDeleting } = useApiMutation<string, any>(
    () => suppliersApi.delete(supplierId),
  );

  const { mutate: togglePreferred } = useApiMutation<boolean, any>(
    (isPreferred) => suppliersApi.togglePreferred(supplierId, { isPreferred }),
  );

  const supplier = supplierResponse?.data;
  const rateCards: SupplierRateCard[] = React.useMemo(() => {
    const d = rateCardsResponse?.data;
    return Array.isArray(d) ? d : (d as any)?.data ?? [];
  }, [rateCardsResponse]);

  const payments: SupplierPayment[] = React.useMemo(() => {
    const d = paymentsResponse?.data;
    return Array.isArray(d) ? d : (d as any)?.data ?? [];
  }, [paymentsResponse]);

  const ledger: SupplierLedger[] = React.useMemo(() => {
    const d = ledgerResponse?.data;
    return Array.isArray(d) ? d : [];
  }, [ledgerResponse]);

  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = ledger.length > 0 ? ledger[ledger.length - 1]!.balance : 0;

  async function handleDelete() {
    const result = await deleteSupplier(supplierId);
    if (result !== undefined) {
      toast.success('Supplier deleted successfully');
      router.push('/suppliers');
    } else {
      toast.error('Failed to delete supplier');
    }
  }

  async function handleTogglePreferred() {
    if (!supplier) return;
    const result = await togglePreferred(!(supplier as any).isPreferred);
    if (result) {
      toast.success('Supplier preference updated');
      refetch();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading supplier...</p>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load supplier</p>
        <Button variant="outline" onClick={() => router.push('/suppliers')}>Back to Suppliers</Button>
      </div>
    );
  }

  const sup = supplier as any;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{getInitials(sup.name ?? '')}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {sup.name}
              </h1>
              <Badge variant="outline" className="text-xs capitalize">{(sup.category ?? 'other').replace('_', ' ')}</Badge>
              {sup.isPreferred && (
                <Badge className="text-xs bg-amber-100 text-amber-900">
                  <Star className="h-3 w-3 mr-1 fill-current" /> Preferred
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              {sup.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{sup.email}</span>}
              {sup.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{sup.phone}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleTogglePreferred}>
            <Heart className={cn('h-4 w-4 mr-1.5', sup.isPreferred && 'fill-current text-red-500')} />
            {sup.isPreferred ? 'Unprefer' : 'Prefer'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/suppliers/${supplierId}/edit`)}>
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-2xl font-bold">
              {totalPayments > 0 ? `₹${(totalPayments / 1000).toFixed(0)}K` : '₹0'}
            </p>
            <p className="text-xs text-muted-foreground">Total Payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-2xl font-bold">
              {outstanding !== 0 ? `₹${(Math.abs(outstanding) / 1000).toFixed(0)}K` : '₹0'}
            </p>
            <p className="text-xs text-muted-foreground">Outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Star className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
            <p className="text-2xl font-bold">{sup.rating ?? 'N/A'}</p>
            <p className="text-xs text-muted-foreground">Rating</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-2xl font-bold">{rateCards.length}</p>
            <p className="text-xs text-muted-foreground">Rate Cards</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="rate-cards">Rate Cards ({rateCards.length})</TabsTrigger>
            <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Overview */}
          <TabsContent value="overview" className="mt-0">
            <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Contact Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Contact Person</span>
                    <span className="text-sm font-medium">{sup.contactPerson || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm font-medium">{sup.email || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="text-sm font-medium">{sup.phone || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Website</span>
                    <span className="text-sm font-medium">{sup.website || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Address</span>
                    <span className="text-sm font-medium text-right max-w-[200px]">{sup.address || '—'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Category</span>
                    <Badge variant="outline" className="text-xs capitalize">{(sup.category ?? 'other').replace('_', ' ')}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">GST Number</span>
                    <span className="text-sm font-mono font-medium">{sup.gstNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Preferred</span>
                    <span className="text-sm font-medium">{sup.isPreferred ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Rating</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      {sup.rating ? (
                        <>
                          {sup.rating}
                          <Star className="h-3 w-3 text-yellow-500 fill-current" />
                        </>
                      ) : '—'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {sup.notes && (
                <Card className="lg:col-span-2">
                  <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sup.notes}</p>
                  </CardContent>
                </Card>
              )}

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Created {new Date(sup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p>Last updated {new Date(sup.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Rate Cards */}
          <TabsContent value="rate-cards" className="mt-0">
            <div className="max-w-5xl">
              {rateCards.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No rate cards available</p>
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Valid From</TableHead>
                      <TableHead>Valid To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateCards.map((rc) => (
                      <TableRow key={rc.id}>
                        <TableCell className="font-medium text-sm">{rc.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs capitalize">{rc.category}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{rc.description || '—'}</TableCell>
                        <TableCell className="text-sm">{rc.validity.from}</TableCell>
                        <TableCell className="text-sm">{rc.validity.to}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Payments */}
          <TabsContent value="payments" className="mt-0">
            <div className="max-w-5xl">
              {payments.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No payments recorded</p>
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((pay) => (
                      <TableRow key={pay.id}>
                        <TableCell className="font-mono font-semibold text-sm">
                          ₹{pay.amount.toLocaleString('en-IN')}
                        </TableCell>
                        <TableCell className="text-sm capitalize">{pay.method.replace('_', ' ')}</TableCell>
                        <TableCell className="text-sm">
                          {new Date(pay.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{pay.reference || '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Ledger */}
          <TabsContent value="ledger" className="mt-0">
            <div className="max-w-5xl">
              {ledger.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No ledger entries</p>
                  </CardContent>
                </Card>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          {new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-sm">{entry.description}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {entry.debit ? `₹${entry.debit.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {entry.credit ? `₹${entry.credit.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          ₹{entry.balance.toLocaleString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Supplier</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{sup.name}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
