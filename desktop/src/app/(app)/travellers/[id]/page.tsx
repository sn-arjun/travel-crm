'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, User, FileText, Edit, Trash2, Globe, Mail, Phone,
  Upload, Download, File, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { travellersApi, visaApi, type Traveller, type VisaRecord, type UpdateTravellerRequest } from '@/lib/api/visa';
import { documentsApi, type Document as DocType } from '@/lib/api/documents';
import { toast } from 'sonner';

function getInitials(first: string, last: string) {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    applied: 'bg-blue-100 text-blue-900',
    processing: 'bg-amber-100 text-amber-900',
    approved: 'bg-green-100 text-green-900',
    rejected: 'bg-red-100 text-red-900',
  };
  return colors[status] ?? 'bg-gray-100 text-gray-900';
}

export default function TravellerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const travellerId = params.id as string;

  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState<UpdateTravellerRequest>({});

  const { data: travellerResponse, loading, error, refetch } = useApiQuery(
    () => travellersApi.getById(travellerId),
    [travellerId],
  );

  const { data: visaResponse } = useApiQuery(
    () => visaApi.list({ page: 1, limit: 100 }),
    [],
  );

  const { mutate: updateTraveller, loading: isUpdating } = useApiMutation<UpdateTravellerRequest, any>(
    (data) => travellersApi.update(travellerId, data),
  );

  const { mutate: deleteTraveller, loading: isDeleting } = useApiMutation<string, any>(
    () => travellersApi.delete(travellerId),
  );

  const { data: docsResponse, refetch: refetchDocs } = useApiQuery(
    () => documentsApi.list({ search: travellerId, limit: 100 }),
    [travellerId],
  );

  const documents: DocType[] = React.useMemo(() => {
    if (!docsResponse?.data) return [];
    const d = (docsResponse.data as any)?.data ?? docsResponse.data;
    return Array.isArray(d) ? d : [];
  }, [docsResponse]);

  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await documentsApi.upload({
        file,
        name: file.name,
        category: 'traveller',
        tags: [travellerId, 'traveller-document'],
      });
      toast.success('Document uploaded successfully!');
      refetchDocs();
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDocDownload = async (doc: DocType) => {
    try {
      const blob = await documentsApi.download(doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download document');
    }
  };

  const handleDocDelete = async (doc: DocType) => {
    if (!confirm(`Delete "${doc.name}"?`)) return;
    try {
      await documentsApi.delete(doc.id);
      toast.success('Document deleted');
      refetchDocs();
    } catch {
      toast.error('Failed to delete document');
    }
  };

  // API returns { data: { first_name, last_name, ... } } — normalize snake_case to camelCase
  const travellerRaw = ((travellerResponse?.data as any)?.data ?? travellerResponse?.data) as any;
  const traveller: Traveller | undefined = travellerRaw ? {
    ...travellerRaw,
    firstName: travellerRaw.firstName ?? travellerRaw.first_name ?? '',
    lastName: travellerRaw.lastName ?? travellerRaw.last_name ?? '',
    passportNumber: travellerRaw.passportNumber ?? travellerRaw.passport_number ?? '',
    dateOfBirth: travellerRaw.dateOfBirth ?? travellerRaw.date_of_birth,
    nationality: travellerRaw.nationality,
    email: travellerRaw.email,
    phone: travellerRaw.phone,
    passportExpiryDate: travellerRaw.passportExpiryDate ?? travellerRaw.passport_expiry_date,
    passportIssuingCountry: travellerRaw.passportIssuingCountry ?? travellerRaw.passport_issuing_country,
    emergencyContactName: travellerRaw.emergencyContactName ?? travellerRaw.emergency_contact_name,
    emergencyContactPhone: travellerRaw.emergencyContactPhone ?? travellerRaw.emergency_contact_phone,
    mealPreference: travellerRaw.mealPreference ?? travellerRaw.meal_preference,
    seatPreference: travellerRaw.seatPreference ?? travellerRaw.seat_preference,
    medicalNotes: travellerRaw.medicalNotes ?? travellerRaw.medical_notes,
    frequentFlyerNumbers: travellerRaw.frequentFlyerNumbers ?? travellerRaw.frequent_flyer_numbers,
    createdBy: travellerRaw.createdBy ?? travellerRaw.created_by ?? '',
    createdAt: travellerRaw.createdAt ?? travellerRaw.created_at ?? '',
    updatedAt: travellerRaw.updatedAt ?? travellerRaw.updated_at ?? '',
  } : undefined;

  const visaRecords: VisaRecord[] = React.useMemo(() => {
    if (!visaResponse?.data) return [];
    const all = Array.isArray(visaResponse.data) ? visaResponse.data : (visaResponse.data as any)?.data ?? [];
    return all.filter((v: VisaRecord) => v.passportNumber === traveller?.passportNumber || v.travelerId === travellerId);
  }, [visaResponse, traveller, travellerId]);

  React.useEffect(() => {
    if (traveller) {
      setEditForm({
        firstName: traveller.firstName,
        lastName: traveller.lastName,
        passportNumber: traveller.passportNumber,
        dateOfBirth: traveller.dateOfBirth ?? '',
        nationality: traveller.nationality ?? '',
        email: traveller.email ?? '',
        phone: traveller.phone ?? '',
      });
    }
  }, [traveller]);

  async function handleSaveEdit() {
    const result = await updateTraveller(editForm);
    if (result) {
      toast.success('Traveller updated');
      setIsEditDialogOpen(false);
      refetch();
    } else {
      toast.error('Failed to update traveller');
    }
  }

  async function handleDelete() {
    const result = await deleteTraveller(travellerId);
    if (result !== undefined) {
      toast.success('Traveller deleted');
      router.push('/travellers');
    } else {
      toast.error('Failed to delete traveller');
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-12 w-12 rounded-full" />
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
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !traveller) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">Failed to load traveller</p>
        <Button variant="outline" onClick={() => router.push('/travellers')}>Back to Travellers</Button>
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
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-base">{getInitials(traveller.firstName, traveller.lastName)}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {traveller.firstName} {traveller.lastName}
            </h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              <span className="font-mono">{traveller.passportNumber}</span>
              {traveller.nationality && <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{traveller.nationality}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
            <Edit className="h-4 w-4 mr-1.5" /> Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="visa">Visa Applications ({visaRecords.length})</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Details */}
          <TabsContent value="details" className="mt-0">
            <div className="max-w-4xl grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Personal Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">First Name</span>
                    <span className="text-sm font-medium">{traveller.firstName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Last Name</span>
                    <span className="text-sm font-medium">{traveller.lastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Date of Birth</span>
                    <span className="text-sm font-medium">
                      {traveller.dateOfBirth
                        ? new Date(traveller.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Nationality</span>
                    <span className="text-sm font-medium">{traveller.nationality || '--'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Passport & Contact</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Passport Number</span>
                    <span className="text-sm font-mono font-medium">{traveller.passportNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Email</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      {traveller.email ? <><Mail className="h-3 w-3" />{traveller.email}</> : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Phone</span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      {traveller.phone ? <><Phone className="h-3 w-3" />{traveller.phone}</> : '--'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>Created {new Date(traveller.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <p>Last updated {new Date(traveller.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Visa Applications */}
          <TabsContent value="visa" className="mt-0">
            <div className="max-w-5xl space-y-4">
              <div className="flex justify-end">
                <Button asChild size="sm">
                  <a href={`/visa/new?travellerId=${travellerId}&travellerName=${encodeURIComponent(traveller.firstName + ' ' + traveller.lastName)}`}>
                    <Plus className="h-4 w-4 mr-1.5" /> New Visa Application
                  </a>
                </Button>
              </div>
              {visaRecords.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No visa applications found</p>
                  </CardContent>
                </Card>
              ) : (
                <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Country</TableHead>
                      <TableHead>Visa Type</TableHead>
                      <TableHead>Application Date</TableHead>
                      <TableHead>Expiry Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visaRecords.map((v) => (
                      <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/visa/${v.id}`)}>
                        <TableCell className="font-medium text-sm">{v.countryName}</TableCell>
                        <TableCell className="text-sm">{v.visaType || '--'}</TableCell>
                        <TableCell className="text-sm">
                          {v.applicationDate ? new Date(v.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {v.expiryDate ? new Date(v.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '--'}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('text-xs capitalize', getStatusColor(v.status))}>{v.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Documents */}
          <TabsContent value="documents" className="mt-0">
            <div className="max-w-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Traveller Documents</h3>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileUpload}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    Upload Document
                  </Button>
                </div>
              </div>
              {documents.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No documents uploaded yet</p>
                    <p className="text-xs mt-1">Upload passport copies, photos, and other travel documents</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <Card key={doc.id}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <File className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(doc.size / 1024).toFixed(1)} KB • {new Date(doc.createdAt).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => handleDocDownload(doc)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => handleDocDelete(doc)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Traveller</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">First Name</Label>
                <Input id="edit-firstName" value={editForm.firstName ?? ''} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-lastName">Last Name</Label>
                <Input id="edit-lastName" value={editForm.lastName ?? ''} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-passport">Passport Number</Label>
              <Input id="edit-passport" value={editForm.passportNumber ?? ''} onChange={(e) => setEditForm({ ...editForm, passportNumber: e.target.value.toUpperCase() })} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-nationality">Nationality</Label>
              <Input id="edit-nationality" value={editForm.nationality ?? ''} onChange={(e) => setEditForm({ ...editForm, nationality: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dob">Date of Birth</Label>
              <Input id="edit-dob" type="date" value={editForm.dateOfBirth ?? ''} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={editForm.email ?? ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" value={editForm.phone ?? ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isUpdating}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Traveller</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{traveller.firstName} {traveller.lastName}</strong>? This cannot be undone.
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
