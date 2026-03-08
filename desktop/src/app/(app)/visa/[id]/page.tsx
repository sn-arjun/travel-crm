'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle, Clock, FileText,
  Edit, Trash2, Globe, Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { visaApi, type VisaChecklistItem } from '@/lib/api/visa';
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

  const { mutate: deleteVisa, loading: isDeleting } = useApiMutation<string, any>(
    () => visaApi.delete(visaId),
  );

  const { mutate: updateChecklistItem } = useApiMutation<{ itemId: string; completed: boolean }, any>(
    ({ itemId, completed }) => visaApi.updateChecklistItem(visaId, itemId, { completed }),
  );

  const { mutate: saveNotes, loading: isSavingNotes } = useApiMutation<{ notes: string }, any>(
    (data) => visaApi.updateNotes(visaId, data),
  );

  const visa = visaResponse?.data;
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading visa record...</p>
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
          <Button variant="outline" size="sm" onClick={() => router.push('/visa')}>
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
