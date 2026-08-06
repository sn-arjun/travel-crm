'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Star, Phone, Mail, MapPin, Building2, CreditCard, FileText, Loader2,
  AlertCircle, Edit, Trash2, Heart, DollarSign, TrendingUp, BarChart3, Plus, Upload,
  Download, File, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { suppliersApi, type SupplierRateCard, type SupplierPayment, type SupplierLedger } from '@/lib/api/suppliers';
import { client, type ApiResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';

// ── Document categories ──
const DOC_CATEGORIES = ['contract', 'license', 'insurance', 'certificate', 'other'] as const;
type DocCategory = typeof DOC_CATEGORIES[number];

const DOC_CATEGORY_LABELS: Record<DocCategory, string> = {
  contract: 'Contract',
  license: 'License',
  insurance: 'Insurance',
  certificate: 'Certificate',
  other: 'Other',
};

interface SupplierDocument {
  id: string;
  name: string;
  category: DocCategory;
  size: number;
  type: string;
  url: string;
  key: string;
  uploadedAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SupplierDocumentsTab({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const [documents, setDocuments] = React.useState<SupplierDocument[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [selectedCategory, setSelectedCategory] = React.useState<DocCategory>('other');
  const [isDragging, setIsDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Load documents from localStorage as fallback (no dedicated supplier documents API)
  const storageKey = `supplier_docs_${supplierId}`;

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setDocuments(JSON.parse(stored));
    } catch { /* ignore */ }
    setLoading(false);
  }, [storageKey]);

  const saveDocuments = (docs: SupplierDocument[]) => {
    setDocuments(docs);
    try {
      localStorage.setItem(storageKey, JSON.stringify(docs));
    } catch { /* ignore */ }
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    const newDocs: SupplierDocument[] = [];

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await client.post<ApiResponse<{ key: string; url: string; name: string; size: number }>>(
          API_ENDPOINTS.files.upload,
          formData as any,
        );
        const uploaded = (res as any)?.data ?? res;
        if (uploaded?.key) {
          newDocs.push({
            id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            category: selectedCategory,
            size: file.size,
            type: file.type,
            url: uploaded.url,
            key: uploaded.key,
            uploadedAt: new Date().toISOString(),
          });
        }
      } catch {
        // If file upload API is not available, store document metadata locally
        newDocs.push({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          category: selectedCategory,
          size: file.size,
          type: file.type,
          url: URL.createObjectURL(file),
          key: `local-${Date.now()}`,
          uploadedAt: new Date().toISOString(),
        });
      }
    }

    if (newDocs.length > 0) {
      const updated = [...documents, ...newDocs];
      saveDocuments(updated);
      toast.success(`${newDocs.length} document${newDocs.length > 1 ? 's' : ''} uploaded`);
    }
    setUploading(false);
  };

  const handleDelete = (docId: string) => {
    if (!confirm('Delete this document?')) return;
    const updated = documents.filter((d) => d.id !== docId);
    saveDocuments(updated);
    toast.success('Document deleted');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">Documents ({documents.length})</h3>
        <div className="flex items-center gap-2">
          <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as DocCategory)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {DOC_CATEGORIES.map((cat) => (
                <SelectItem key={cat} value={cat}>{DOC_CATEGORY_LABELS[cat]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleUpload(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Upload Document
          </Button>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-4',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/40',
        )}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          {isDragging
            ? 'Drop files here to upload'
            : 'Drag and drop files here, or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Category: <span className="font-medium">{DOC_CATEGORY_LABELS[selectedCategory]}</span>
        </p>
      </div>

      {/* Document List */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </CardContent>
        </Card>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">No documents uploaded</p>
            <p className="text-xs mt-1">Upload contracts, licenses, and other supplier documents</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate max-w-[200px]">{doc.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">
                    {DOC_CATEGORY_LABELS[doc.category] ?? doc.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatFileSize(doc.size)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Download"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = doc.url;
                        link.download = doc.name;
                        link.target = '_blank';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(doc.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function SupplierDetailPage() {
  const router = useRouter();
  const params = useParams();
  const supplierId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = React.useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = React.useState(false);
  const [paymentForm, setPaymentForm] = React.useState({
    amount: '',
    method: 'bank_transfer',
    reference_number: '',
    payment_date: new Date().toISOString().split('T')[0]!,
    notes: '',
  });
  const [isSavingPayment, setIsSavingPayment] = React.useState(false);

  const { data: supplierResponse, loading, error, refetch } = useApiQuery(
    () => suppliersApi.getById(supplierId),
    [supplierId],
  );

  const { data: rateCardsResponse, refetch: refetchRateCards } = useApiQuery(
    () => suppliersApi.getRateCards(supplierId),
    [supplierId],
  );

  const { data: paymentsResponse, refetch: refetchPayments } = useApiQuery(
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
  const outstanding = ledger.length > 0 ? ledger[ledger.length - 1]!.runningBalance : 0;

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
    const sup = supplier as any;
    const current = sup.is_preferred ?? sup.isPreferred ?? false;
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
        amount: parseFloat(paymentForm.amount),
        method: paymentForm.method,
        reference_number: paymentForm.reference_number || undefined,
        payment_date: paymentForm.payment_date,
        notes: paymentForm.notes || undefined,
      });
      toast.success('Payment recorded');
      setIsPaymentDialogOpen(false);
      setPaymentForm({ amount: '', method: 'bank_transfer', reference_number: '', payment_date: new Date().toISOString().split('T')[0]!, notes: '' });
      refetchPayments();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setIsSavingPayment(false);
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
  const supplierName = sup.company_name || sup.name || 'Unknown';
  const isPreferred = sup.is_preferred ?? sup.isPreferred ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{getInitials(supplierName)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {supplierName}
              </h1>
              <Badge variant="outline" className="text-xs capitalize">{(sup.category ?? 'other').replace(/_/g, ' ')}</Badge>
              {isPreferred && (
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
          <Button variant="outline" size="sm" onClick={() => setIsEmailDialogOpen(true)}>
            <Mail className="h-4 w-4 mr-1.5" /> Email Supplier
          </Button>
          <Button variant="outline" size="sm" onClick={handleTogglePreferred}>
            <Heart className={cn('h-4 w-4 mr-1.5', isPreferred && 'fill-current text-red-500')} />
            {isPreferred ? 'Unprefer' : 'Prefer'}
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
            <TabsTrigger value="documents">Documents</TabsTrigger>
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
                    <span className="text-sm font-medium">{sup.contact_person || sup.contactPerson || '—'}</span>
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
                  {(sup.city || sup.state || sup.country) && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Location</span>
                      <span className="text-sm font-medium text-right max-w-[200px]">
                        {[sup.city, sup.state, sup.country].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Business Details</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Category</span>
                    <Badge variant="outline" className="text-xs capitalize">{(sup.category ?? 'other').replace(/_/g, ' ')}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={sup.status === 'inactive' ? 'secondary' : 'outline'} className={sup.status !== 'inactive' ? 'text-green-700 border-green-300' : ''}>
                      {sup.status ?? 'active'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">GST Number</span>
                    <span className="text-sm font-mono font-medium">{sup.gst_number || sup.gstNumber || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Tax ID</span>
                    <span className="text-sm font-mono font-medium">{sup.tax_id || sup.taxId || '—'}</span>
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
                  <p>Created {new Date(sup.created_at || sup.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p>Last updated {new Date(sup.updated_at || sup.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Rate Cards */}
          <TabsContent value="rate-cards" className="mt-0">
            <div className="max-w-5xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Rate Cards</h3>
                <Button size="sm" onClick={() => router.push(`/rate-cards/new?supplierId=${supplierId}&supplierName=${encodeURIComponent(supplierName)}`)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Add Rate Card
                </Button>
              </div>
              {rateCards.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No rate cards available</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={() => router.push(`/rate-cards/new?supplierId=${supplierId}&supplierName=${encodeURIComponent(supplierName)}`)}
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Add Rate Card
                    </Button>
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
                        <TableCell className="text-sm">{rc.validity?.from ?? '—'}</TableCell>
                        <TableCell className="text-sm">{rc.validity?.to ?? '—'}</TableCell>
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground">Payments</h3>
                <Button size="sm" onClick={() => setIsPaymentDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Record Payment
                </Button>
              </div>
              {payments.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No payments recorded</p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setIsPaymentDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-1.5" /> Record Payment
                    </Button>
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
                        <TableCell className="text-sm capitalize">{pay.method.replace(/_/g, ' ')}</TableCell>
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
                      <TableRow key={entry.id ?? idx}>
                        <TableCell className="text-sm">
                          {new Date(entry.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell className="text-sm">{entry.description}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">
                          {entry.debitAmount ? `₹${entry.debitAmount.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">
                          {entry.creditAmount ? `₹${entry.creditAmount.toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-semibold">
                          ₹{Math.abs(entry.runningBalance).toLocaleString('en-IN')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents" className="mt-0">
            <SupplierDocumentsTab supplierId={supplierId} supplierName={supplierName} />
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
            Are you sure you want to delete <strong>{supplierName}</strong>? This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment to {supplierName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Date <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Reference Number</Label>
              <Input
                placeholder="Transaction / cheque number"
                value={paymentForm.reference_number}
                onChange={(e) => setPaymentForm((f) => ({ ...f, reference_number: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
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
              {isSavingPayment ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Supplier Dialog */}
      {isEmailDialogOpen && sup.email ? (
        <SendMessageDialog
          open={isEmailDialogOpen}
          onOpenChange={setIsEmailDialogOpen}
          defaultChannel="email"
          contact={{ id: supplierId, name: supplierName, email: sup.email, phone: sup.phone }}
        />
      ) : isEmailDialogOpen ? (
        <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>No Email Address</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This supplier has no email address. Please edit the supplier to add one.</p>
            <DialogFooter>
              <Button onClick={() => setIsEmailDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
