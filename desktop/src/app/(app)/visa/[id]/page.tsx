'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle, Clock, FileText,
  Edit, Trash2, Globe, Calendar, XCircle, Upload, Download, File, Image, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { visaApi, type VisaChecklistItem, type VisaDocument } from '@/lib/api/visa';
import { toast } from 'sonner';

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    applied: 'bg-blue-100 text-blue-900',
    processing: 'bg-amber-100 text-amber-900',
    approved: 'bg-green-100 text-green-900',
    rejected: 'bg-red-100 text-red-900',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-900';
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case 'rejected': return <AlertCircle className="h-4 w-4 text-red-600" />;
    case 'processing': return <Clock className="h-4 w-4 text-amber-600" />;
    default: return <Circle className="h-4 w-4 text-blue-600" />;
  }
}

export default function VisaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const visaId = params.id as string;

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [isEditingNotes, setIsEditingNotes] = React.useState(false);

  const { data: visaResponse, loading, error, refetch } = useApiQuery(
    () => visaApi.getById(visaId),
    [visaId],
  );

  const { data: checklistResponse, refetch: refetchChecklist } = useApiQuery(
    () => visaApi.getChecklist(visaId),
    [visaId],
  );

  const { data: notesResponse } = useApiQuery(
    () => visaApi.getNotes(visaId),
    [visaId],
  );

  const { data: documentsResponse, refetch: refetchDocuments } = useApiQuery(
    () => visaApi.getDocuments(visaId),
    [visaId],
  );

  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [selectedDocType, setSelectedDocType] = React.useState('other');
  const [deletingDocId, setDeletingDocId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const documents: VisaDocument[] = React.useMemo(() => {
    const d = documentsResponse?.data;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object' && 'data' in (d as any)) {
      const inner = (d as any).data;
      return Array.isArray(inner) ? inner : [];
    }
    return [];
  }, [documentsResponse]);

  const { mutate: deleteVisa, loading: isDeleting } = useApiMutation<string, any>(
    () => visaApi.delete(visaId),
  );

  const { mutate: updateChecklistItem } = useApiMutation<{ itemId: string; completed: boolean }, any>(
    ({ itemId, completed }) => visaApi.updateChecklistItem(visaId, itemId, { completed }),
  );

  const { mutate: saveNotes, loading: isSavingNotes } = useApiMutation<{ notes: string }, any>(
    (data) => visaApi.updateNotes(visaId, data),
  );

  // API returns { data: { destination_country, ... } } — normalize snake_case to camelCase
  const visaRaw = ((visaResponse?.data as any)?.data ?? visaResponse?.data) as any;
  const visa = visaRaw ? {
    ...visaRaw,
    travellerName: visaRaw.travellerName ?? visaRaw.traveller_name ?? '',
    countryName: visaRaw.countryName ?? visaRaw.destination_country ?? visaRaw.country ?? '',
    destinationCountry: visaRaw.destinationCountry ?? visaRaw.destination_country ?? visaRaw.country ?? '',
    visaType: visaRaw.visaType ?? visaRaw.visa_type ?? '',
    status: visaRaw.status ?? 'not_started',
    applicationDate: visaRaw.applicationDate ?? visaRaw.applied_date,
    expiryDate: visaRaw.expiryDate ?? visaRaw.visa_expiry_date ?? visaRaw.expiry_date,
    travellerId: visaRaw.travellerId ?? visaRaw.traveller_id,
    passportNumber: visaRaw.passportNumber ?? visaRaw.passport_number,
    createdAt: visaRaw.createdAt ?? visaRaw.created_at ?? '',
    updatedAt: visaRaw.updatedAt ?? visaRaw.updated_at ?? '',
  } : undefined;
  const checklist: VisaChecklistItem[] = React.useMemo(() => {
    const d = checklistResponse?.data;
    return Array.isArray(d) ? d : [];
  }, [checklistResponse]);

  React.useEffect(() => {
    if (notesResponse?.data) {
      setNotes((notesResponse.data as any).notes ?? '');
    }
  }, [notesResponse]);

  const completedCount = checklist.filter((c) => c.completed).length;
  const progressPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  async function handleDelete() {
    const result = await deleteVisa(visaId);
    if (result !== undefined) {
      toast.success('Visa record deleted');
      router.push('/visa');
    } else {
      toast.error('Failed to delete visa record');
    }
  }

  async function handleToggleChecklistItem(item: VisaChecklistItem) {
    const result = await updateChecklistItem({ itemId: item.id, completed: !item.completed });
    if (result) {
      toast.success(item.completed ? 'Item unchecked' : 'Item completed');
      refetchChecklist();
    }
  }

  async function handleSaveNotes() {
    const result = await saveNotes({ notes });
    if (result) {
      toast.success('Notes saved');
      setIsEditingNotes(false);
    } else {
      toast.error('Failed to save notes');
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error('File type not allowed. Accepted: PDF, JPEG, PNG, WebP, DOCX');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate progress since we can't track actual upload progress with fetch
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      const result = await visaApi.uploadDocument(visaId, file, selectedDocType);
      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result) {
        toast.success('Document uploaded successfully');
        refetchDocuments();
      } else {
        toast.error('Failed to upload document');
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      toast.error(err?.message || 'Failed to upload document');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleDownloadDocument(doc: VisaDocument) {
    try {
      const blob = await visaApi.downloadDocument(visaId, doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      toast.error('Failed to download document');
    }
  }

  async function handleDeleteDocument(docId: string) {
    setDeletingDocId(docId);
    try {
      await visaApi.deleteDocument(visaId, docId);
      toast.success('Document deleted');
      refetchDocuments();
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeletingDocId(null);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(mimeType: string) {
    if (mimeType?.startsWith('image/')) return <Image className="h-5 w-5 text-blue-500" />;
    if (mimeType === 'application/pdf') return <FileText className="h-5 w-5 text-red-500" />;
    return <File className="h-5 w-5 text-gray-500" />;
  }

  const DOCUMENT_TYPES = [
    { value: 'passport', label: 'Passport Copy' },
    { value: 'photo', label: 'Passport Photo' },
    { value: 'application_form', label: 'Application Form' },
    { value: 'bank_statement', label: 'Bank Statement' },
    { value: 'cover_letter', label: 'Cover Letter' },
    { value: 'invitation_letter', label: 'Invitation Letter' },
    { value: 'travel_insurance', label: 'Travel Insurance' },
    { value: 'hotel_booking', label: 'Hotel Booking' },
    { value: 'flight_itinerary', label: 'Flight Itinerary' },
    { value: 'employment_letter', label: 'Employment Letter' },
    { value: 'itr', label: 'ITR / Tax Returns' },
    { value: 'other', label: 'Other' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !visa) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load visa record</p>
        <Button variant="outline" onClick={() => router.push('/visa')}>Back to Visa</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {visa.travellerName}
              </h1>
              <Badge className={cn('text-xs capitalize', getStatusColor(visa.status))}>
                {getStatusIcon(visa.status)}
                <span className="ml-1">{visa.status}</span>
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{visa.countryName}</span>
              {visa.visaType && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{visa.visaType}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/visa/${visaId}/edit`)}>
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Status Pipeline Stepper */}
      {(() => {
        const STEPS = ['not_started', 'documents_collecting', 'applied', 'processing', 'approved'];
        const STEP_LABELS: Record<string, string> = {
          not_started: 'Not Started',
          documents_collecting: 'Collecting Docs',
          applied: 'Applied',
          processing: 'Processing',
          approved: 'Approved',
        };
        const currentIdx = STEPS.indexOf(visa.status);
        const isRejected = visa.status === 'rejected';
        return (
          <div className="px-6 py-3 border-b">
            <div className="flex items-center gap-0">
              {STEPS.map((step, idx) => (
                <React.Fragment key={step}>
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      'h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs font-medium',
                      isRejected && idx <= currentIdx ? 'border-red-500 bg-red-50 text-red-700' :
                      idx < currentIdx ? 'border-primary bg-primary text-white' :
                      idx === currentIdx ? 'border-primary bg-primary/10 text-primary' :
                      'border-muted-foreground/30 bg-background text-muted-foreground'
                    )}>
                      {idx < currentIdx && !isRejected ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <span className={cn('text-[10px] mt-1 text-center whitespace-nowrap', idx === currentIdx ? 'text-primary font-medium' : 'text-muted-foreground')}>
                      {STEP_LABELS[step]}
                    </span>
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 mx-1 mb-4', idx < currentIdx && !isRejected ? 'bg-primary' : 'bg-muted')} />
                  )}
                </React.Fragment>
              ))}
              {isRejected && (
                <>
                  <div className="flex-1 h-0.5 mx-1 mb-4 bg-red-200" />
                  <div className="flex flex-col items-center">
                    <div className="h-7 w-7 rounded-full border-2 border-red-500 bg-red-50 text-red-700 flex items-center justify-center">
                      <XCircle className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] mt-1 text-red-600 font-medium">Rejected</span>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Rejection Banner */}
      {visa.status === 'rejected' && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 dark:bg-red-900/20 dark:border-red-800">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-700">Application Rejected</p>
              {(visa as any).rejectionReason && (
                <p className="text-xs text-red-600 mt-0.5">{(visa as any).rejectionReason}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 text-center">
            <Globe className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <p className="text-lg font-bold">{visa.countryName}</p>
            <p className="text-xs text-muted-foreground">Country</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <FileText className="h-5 w-5 mx-auto text-purple-500 mb-1" />
            <p className="text-lg font-bold">{visa.visaType || 'N/A'}</p>
            <p className="text-xs text-muted-foreground">Visa Type</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <p className="text-lg font-bold">{progressPercent}%</p>
            <p className="text-xs text-muted-foreground">Checklist Complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Calendar className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <p className="text-lg font-bold">
              {visa.expiryDate
                ? new Date(visa.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                : 'N/A'}
            </p>
            <p className="text-xs text-muted-foreground">Expiry Date</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="checklist">Checklist ({completedCount}/{checklist.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents ({documents.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Details */}
          <TabsContent value="details" className="mt-0">
            <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Traveller Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Name</span>
                    <span className="text-sm font-medium">{visa.travellerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Passport Number</span>
                    <span className="text-sm font-mono font-medium">{visa.passportNumber}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Visa Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Country</span>
                    <span className="text-sm font-medium">{visa.countryName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Visa Type</span>
                    <span className="text-sm font-medium">{visa.visaType || '--'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Application Date</span>
                    <span className="text-sm font-medium">
                      {visa.applicationDate
                        ? new Date(visa.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Expiry Date</span>
                    <span className="text-sm font-medium">
                      {visa.expiryDate
                        ? new Date(visa.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge className={cn('text-xs capitalize', getStatusColor(visa.status))}>{visa.status}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Created {new Date(visa.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p>Last updated {new Date(visa.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Checklist */}
          <TabsContent value="checklist" className="mt-0">
            <div className="max-w-2xl space-y-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm text-muted-foreground">{completedCount}/{checklist.length} completed</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progressPercent}%` }} />
                  </div>
                </CardContent>
              </Card>

              {checklist.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No checklist items</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <Card key={item.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => handleToggleChecklistItem(item)}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className={cn(
                          'h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
                          item.completed ? 'bg-primary border-primary' : 'border-muted-foreground/30',
                        )}>
                          {item.completed && <CheckCircle2 className="h-4 w-4 text-white" />}
                        </div>
                        <div className="flex-1">
                          <p className={cn('text-sm', item.completed && 'line-through text-muted-foreground')}>{item.item}</p>
                          {item.completedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Completed {new Date(item.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents" className="mt-0">
            <div className="max-w-3xl space-y-4">
              {/* Upload Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Upload Document</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Document Type</label>
                      <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((dt) => (
                            <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.docx"
                        onChange={handleFileUpload}
                        className="hidden"
                        disabled={isUploading}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <Upload className="h-4 w-4 mr-1.5" />
                        )}
                        {isUploading ? 'Uploading...' : 'Choose File'}
                      </Button>
                    </div>
                  </div>

                  {/* Upload Progress */}
                  {isUploading && (
                    <div className="mt-3 space-y-1">
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">{Math.round(uploadProgress)}%</p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground mt-2">
                    Accepted formats: PDF, JPEG, PNG, WebP, DOCX. Maximum size: 10MB.
                  </p>
                </CardContent>
              </Card>

              {/* Documents List */}
              {documents.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No documents uploaded yet</p>
                    <p className="text-xs mt-1">Upload passport copies, application forms, and other required documents.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const docTypeLabel = DOCUMENT_TYPES.find((dt) => dt.value === doc.document_type)?.label || doc.document_type || 'Other';
                    return (
                      <Card key={doc.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="shrink-0">
                            {getFileIcon(doc.mime_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{doc.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{docTypeLabel}</Badge>
                              <span>{formatFileSize(doc.file_size)}</span>
                              {doc.uploader_name && <span>by {doc.uploader_name}</span>}
                              <span>
                                {new Date(doc.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDownloadDocument(doc)}
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => handleDeleteDocument(doc.id)}
                              disabled={deletingDocId === doc.id}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              {deletingDocId === doc.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Notes */}
          <TabsContent value="notes" className="mt-0">
            <div className="max-w-2xl">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Notes</CardTitle>
                    {!isEditingNotes && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditingNotes(true)}>
                        <Edit className="h-4 w-4 mr-1.5" /> Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isEditingNotes ? (
                    <div className="space-y-3">
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Add notes about this visa application..." />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setIsEditingNotes(false)}>Cancel</Button>
                        <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                          {isSavingNotes && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {notes || 'No notes yet. Click Edit to add notes.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="mt-0">
            <div className="max-w-2xl space-y-4">
              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-10 w-10 rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 w-px bg-border mt-2 mb-2" style={{ height: '40px' }} />
                </div>
                <div className="pb-4 pt-1">
                  <h4 className="text-sm font-semibold">Application Created</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(visa.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {visa.applicationDate && (
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 w-px bg-border mt-2 mb-2" style={{ height: '40px' }} />
                  </div>
                  <div className="pb-4 pt-1">
                    <h4 className="text-sm font-semibold">Application Submitted</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(visa.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={cn(
                    'h-10 w-10 rounded-full border-2 flex items-center justify-center',
                    visa.status === 'approved' ? 'border-green-500 bg-green-50' :
                    visa.status === 'rejected' ? 'border-red-500 bg-red-50' :
                    'border-amber-500 bg-amber-50'
                  )}>
                    {getStatusIcon(visa.status)}
                  </div>
                </div>
                <div className="pb-4 pt-1">
                  <h4 className="text-sm font-semibold capitalize">Status: {visa.status}</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Last updated {new Date(visa.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Visa Record</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the visa record for <strong>{visa.travellerName}</strong>? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
