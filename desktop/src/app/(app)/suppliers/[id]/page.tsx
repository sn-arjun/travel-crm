'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Heart, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { DetailPage } from '@/components/domain';
import {
  Badge, Button, CurrencyInput, DatePicker, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SectionCard, Spinner, Stat, Textarea,
} from '@/components/ui';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { suppliersApi, type SupplierLedger, type SupplierPayment, type SupplierRateCard } from '@/lib/api/suppliers';

interface SupplierDocument {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SupplierDocuments({ supplierId }: { supplierId: string }) {
  const storageKey = `supplier_docs_${supplierId}`;
  const [documents, setDocuments] = React.useState<SupplierDocument[]>([]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setDocuments(JSON.parse(stored));
    } catch {
      /* ignore malformed local cache */
    }
  }, [storageKey]);

  function saveDocuments(docs: SupplierDocument[]) {
    setDocuments(docs);
    try {
      localStorage.setItem(storageKey, JSON.stringify(docs));
    } catch {
      /* storage unavailable — in-memory state still reflects the change */
    }
  }

  function handleFiles(files: File[]) {
    const newDocs: SupplierDocument[] = files.map((file) => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    }));
    saveDocuments([...documents, ...newDocs]);
    toast.success(`${newDocs.length} document${newDocs.length > 1 ? 's' : ''} uploaded`);
  }

  function handleDelete(id: string) {
    saveDocuments(documents.filter((d) => d.id !== id));
    toast.success('Document deleted');
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <FileDropzone onFiles={handleFiles} multiple label="Upload document" />
      {documents.length === 0 ? (
        <p className="text-sm text-ds-foreground-muted">No documents uploaded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="text-sm font-medium">{doc.name}</TableCell>
                <TableCell className="text-sm text-ds-foreground-muted">{formatFileSize(doc.size)}</TableCell>
                <TableCell className="text-sm text-ds-foreground-muted">
                  {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(doc.id)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function SupplierDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);
  const [paymentForm, setPaymentForm] = React.useState<{
    amount: number | undefined;
    method: string;
    reference_number: string;
    payment_date: Date;
    notes: string;
  }>({
    amount: undefined,
    method: 'bank_transfer',
    reference_number: '',
    payment_date: new Date(),
    notes: '',
  });
  const [isSavingPayment, setIsSavingPayment] = React.useState(false);

  const { data: supplierResponse, loading, error, refetch } = useApiQuery(
    () => suppliersApi.getById(supplierId),
    [supplierId],
  );

  const { data: rateCardsResponse } = useApiQuery(() => suppliersApi.getRateCards(supplierId), [supplierId]);
  const { data: paymentsResponse, refetch: refetchPayments } = useApiQuery(() => suppliersApi.getPayments(supplierId), [supplierId]);
  const { data: ledgerResponse } = useApiQuery(() => suppliersApi.getLedger(supplierId), [supplierId]);

  const { mutate: deleteSupplier } = useApiMutation<string, any>(() => suppliersApi.delete(supplierId));
  const { mutate: togglePreferred } = useApiMutation<boolean, any>(
    (isPreferred) => suppliersApi.togglePreferred(supplierId, { isPreferred }),
  );

  const supplier = supplierResponse?.data as any;

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
  const outstanding = ledger.length > 0 ? ledger[ledger.length - 1]!.runningBalance : 0;

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete supplier',
      description: `Are you sure you want to delete ${supplier?.company_name || supplier?.name}? This action cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
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
    const current = supplier.is_preferred ?? supplier.isPreferred ?? false;
    const result = await togglePreferred(!current);
    if (result) {
      toast.success('Supplier preference updated');
      refetch();
    }
  }

  async function handleRecordPayment() {
    if (!paymentForm.amount || !paymentForm.payment_date) {
      toast.error('Amount and date are required');
      return;
    }
    setIsSavingPayment(true);
    try {
      await suppliersApi.recordPayment(supplierId, {
        amount: paymentForm.amount,
        method: paymentForm.method,
        reference_number: paymentForm.reference_number || undefined,
        payment_date: paymentForm.payment_date.toISOString().split('T')[0]!,
        notes: paymentForm.notes || undefined,
      });
      toast.success('Payment recorded');
      setIsPaymentDialogOpen(false);
      setPaymentForm({ amount: undefined, method: 'bank_transfer', reference_number: '', payment_date: new Date(), notes: '' });
      refetchPayments();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setIsSavingPayment(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-ds-4">
        <Spinner className="size-8" />
        <p className="text-ds-foreground-muted">Loading supplier...</p>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-ds-4">
        <p className="text-ds-danger">Failed to load supplier</p>
        <Button variant="outline" onClick={() => router.push('/suppliers')}>Back to Suppliers</Button>
      </div>
    );
  }

  const supplierName = supplier.company_name || supplier.name || 'Unknown';
  const isPreferred = supplier.is_preferred ?? supplier.isPreferred ?? false;

  return (
    <div className="p-ds-6">
      <DetailPage
        entity={supplier}
        title={supplierName}
        subtitle={(supplier.category ?? 'other').replace(/_/g, ' ')}
        status={
          <div className="flex items-center gap-ds-2">
            <Badge variant={supplier.status === 'inactive' ? 'secondary' : 'outline'}>{supplier.status ?? 'active'}</Badge>
            {isPreferred && (
              <Badge className="bg-ds-warning-subtle text-ds-warning-on-subtle">
                <Star className="h-3 w-3" aria-hidden="true" /> Preferred
              </Badge>
            )}
          </div>
        }
        onBack={() => router.push('/suppliers')}
        messaging={{ recipientId: supplierId, recipientName: supplierName, email: supplier.email, phone: supplier.phone }}
        primaryActions={
          <Button variant="outline" size="sm" onClick={handleTogglePreferred}>
            <Heart className={isPreferred ? 'fill-current text-ds-danger' : ''} aria-hidden="true" />
            {isPreferred ? 'Unprefer' : 'Prefer'}
          </Button>
        }
        actions={[
          { label: 'Edit', icon: <Pencil aria-hidden="true" />, onSelect: () => router.push(`/suppliers/${supplierId}/edit`) },
          { label: 'Delete', icon: <Trash2 aria-hidden="true" />, onSelect: handleDelete, destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-ds-4">
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-ds-4">
              <Stat label="Total Payments" value={totalPayments.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} />
              <Stat label="Outstanding" value={Math.abs(outstanding).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} />
              <Stat label="Rating" value={supplier.rating ? `${supplier.rating} ★` : 'N/A'} />
              <Stat label="Rate Cards" value={String(rateCards.length)} />
            </div>

            <SectionCard title="Contact Information">
              <div className="flex flex-col gap-ds-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Contact Person</span>
                  <span className="font-medium">{supplier.contact_person || supplier.contactPerson || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Email</span>
                  <span className="font-medium">{supplier.email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Phone</span>
                  <span className="font-medium">{supplier.phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Website</span>
                  <span className="font-medium">{supplier.website || '—'}</span>
                </div>
                {(supplier.address || supplier.city || supplier.state || supplier.country || supplier.postal_code || supplier.postalCode) && (
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">Location</span>
                    <span className="font-medium text-right max-w-[220px]">
                      {[supplier.address, supplier.city, supplier.state, supplier.country, supplier.postal_code || supplier.postalCode].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Business Details">
              <div className="flex flex-col gap-ds-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Category</span>
                  <Badge variant="outline" className="capitalize">{(supplier.category ?? 'other').replace(/_/g, ' ')}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Status</span>
                  <Badge variant={supplier.status === 'inactive' ? 'secondary' : 'outline'}>{supplier.status ?? 'active'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">GST Number</span>
                  <span className="font-mono font-medium">{supplier.gst_number || supplier.gstNumber || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ds-foreground-muted">Tax ID</span>
                  <span className="font-mono font-medium">{supplier.tax_id || supplier.taxId || '—'}</span>
                </div>
              </div>
            </SectionCard>

            {supplier.notes && (
              <SectionCard title="Notes" className="lg:col-span-2">
                <p className="text-sm text-ds-foreground-muted whitespace-pre-wrap">{supplier.notes}</p>
              </SectionCard>
            )}

            <SectionCard title="Timeline" className="lg:col-span-2">
              <div className="flex flex-col gap-ds-1 text-sm text-ds-foreground-muted">
                <p>Created {new Date(supplier.created_at || supplier.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p>Last updated {new Date(supplier.updated_at || supplier.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </SectionCard>
          </div>
        }
        related={[
          {
            title: `Rate Cards (${rateCards.length})`,
            action: (
              <Button size="sm" onClick={() => router.push(`/rate-cards/new?supplierId=${supplierId}&supplierName=${encodeURIComponent(supplierName)}`)}>
                <Plus aria-hidden="true" /> Add Rate Card
              </Button>
            ),
            content: rateCards.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted py-ds-4 text-center">No rate cards available.</p>
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
                      <TableCell><Badge variant="outline" className="capitalize">{rc.category}</Badge></TableCell>
                      <TableCell className="text-sm text-ds-foreground-muted">{rc.description || '—'}</TableCell>
                      <TableCell className="text-sm">{rc.validity?.from ?? '—'}</TableCell>
                      <TableCell className="text-sm">{rc.validity?.to ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ),
          },
          {
            title: `Payments (${payments.length})`,
            action: (
              <Button size="sm" onClick={() => setIsPaymentDialogOpen(true)}>
                <Plus aria-hidden="true" /> Record Payment
              </Button>
            ),
            content: payments.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted py-ds-4 text-center">No payments recorded.</p>
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
                        {pay.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{pay.method.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(pay.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-ds-foreground-muted">{pay.reference || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ),
          },
          {
            title: 'Ledger',
            content: ledger.length === 0 ? (
              <p className="text-sm text-ds-foreground-muted py-ds-4 text-center">No ledger entries.</p>
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
                    <TableRow key={entry.id ?? idx}>
                      <TableCell className="text-sm">
                        {new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-sm">{entry.description}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-ds-danger">
                        {entry.debitAmount ? entry.debitAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-ds-success">
                        {entry.creditAmount ? entry.creditAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">
                        {Math.abs(entry.runningBalance).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ),
          },
        ]}
        documents={<SupplierDocuments supplierId={supplierId} />}
      />

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment to {supplierName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4 py-ds-2">
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="flex flex-col gap-ds-2">
                <Label>Amount <span className="text-ds-danger">*</span></Label>
                <CurrencyInput
                  value={paymentForm.amount}
                  onChange={(v) => setPaymentForm((f) => ({ ...f, amount: v }))}
                />
              </div>
              <div className="flex flex-col gap-ds-2">
                <Label>Payment Date <span className="text-ds-danger">*</span></Label>
                <DatePicker
                  value={paymentForm.payment_date}
                  onChange={(d) => setPaymentForm((f) => ({ ...f, payment_date: d ?? new Date() }))}
                  maxDate={new Date()}
                />
              </div>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Method</Label>
              <Select value={paymentForm.method} onValueChange={(v) => setPaymentForm((f) => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Reference Number</Label>
              <Input
                placeholder="Transaction / cheque number"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm((f) => ({ ...f, reference_number: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                rows={2}
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={isSavingPayment}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isSavingPayment}>
              {isSavingPayment ? <Spinner className="size-4" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
