'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Merge, Search, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { contactsApi, type MergeContactRequest } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';
import { toast } from 'sonner';

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

const MERGE_FIELDS = [
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'type', label: 'Type' },
  { key: 'notes', label: 'Notes' },
];

export default function ContactMergePageWrapper() {
  return (
    <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <ContactMergePage />
    </React.Suspense>
  );
}

function ContactMergePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search1, setSearch1] = React.useState('');
  const [search2, setSearch2] = React.useState('');
  const [contact1Id, setContact1Id] = React.useState(searchParams.get('primary') ?? '');
  const [contact2Id, setContact2Id] = React.useState(searchParams.get('secondary') ?? '');
  const [fieldSelection, setFieldSelection] = React.useState<Record<string, 'primary' | 'secondary'>>({});
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  // Search contacts
  const { data: searchResponse1 } = useApiQuery(
    () => contactsApi.list({ page: 1, limit: 10, search: search1 || undefined }),
    [search1],
  );
  const { data: searchResponse2 } = useApiQuery(
    () => contactsApi.list({ page: 1, limit: 10, search: search2 || undefined }),
    [search2],
  );

  // Load selected contacts
  const { data: contact1Response } = useApiQuery(
    () => contact1Id ? contactsApi.getById(contact1Id) : Promise.resolve(null),
    [contact1Id],
  );
  const { data: contact2Response } = useApiQuery(
    () => contact2Id ? contactsApi.getById(contact2Id) : Promise.resolve(null),
    [contact2Id],
  );

  // Merge preview
  const { data: previewResponse } = useApiQuery(
    () => (contact1Id && contact2Id) ? contactsApi.getMergePreview(contact1Id, contact2Id) : Promise.resolve(null),
    [contact1Id, contact2Id],
  );

  const { mutate: mergeContacts, loading: isMerging } = useApiMutation<MergeContactRequest, any>(
    (data) => contactsApi.merge(data),
  );

  const searchResults1: Contact[] = React.useMemo(() => {
    if (!searchResponse1?.data) return [];
    const d = searchResponse1.data;
    return Array.isArray(d) ? d : (d as any)?.data ?? [];
  }, [searchResponse1]);

  const searchResults2: Contact[] = React.useMemo(() => {
    if (!searchResponse2?.data) return [];
    const d = searchResponse2.data;
    return Array.isArray(d) ? d : (d as any)?.data ?? [];
  }, [searchResponse2]);

  const contact1 = (contact1Response as any)?.data as Contact | undefined;
  const contact2 = (contact2Response as any)?.data as Contact | undefined;

  // Initialize field selection
  React.useEffect(() => {
    if (contact1 && contact2) {
      const sel: Record<string, 'primary' | 'secondary'> = {};
      MERGE_FIELDS.forEach((f) => {
        sel[f.key] = 'primary'; // default to primary
      });
      setFieldSelection(sel);
    }
  }, [contact1, contact2]);

  function getFieldValue(contact: Contact | undefined, field: string): string {
    if (!contact) return '--';
    return (contact as any)[field] ?? '--';
  }

  async function handleMerge() {
    if (!contact1Id || !contact2Id) return;

    const result = await mergeContacts({
      primaryId: contact1Id,
      secondaryId: contact2Id,
      mergeFields: fieldSelection,
    });

    if (result) {
      toast.success('Contacts merged successfully');
      const data = (result as any)?.data;
      router.push(`/contacts/${data?.id ?? contact1Id}`);
    } else {
      toast.error('Failed to merge contacts');
    }
  }

  const bothSelected = !!contact1 && !!contact2;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Merge Contacts
            </h1>
            <p className="text-sm text-muted-foreground">Select two contacts to merge into one</p>
          </div>
        </div>
        {bothSelected && (
          <Button onClick={() => setIsConfirmOpen(true)}>
            <Merge className="h-4 w-4 mr-1.5" /> Merge Contacts
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Contact Selection */}
          <div className="grid grid-cols-2 gap-6">
            {/* Primary Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className="text-xs bg-blue-100 text-blue-900">Primary</Badge>
                  Contact to Keep
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact1 ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(contact1.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{contact1.name}</p>
                      <p className="text-xs text-muted-foreground">{contact1.email || contact1.phone || ''}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setContact1Id(''); setSearch1(''); }}>Change</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search contacts..."
                        value={search1}
                        onChange={(e) => setSearch1(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    {search1 && searchResults1.length > 0 && (
                      <div className="border rounded-lg max-h-48 overflow-auto">
                        {searchResults1.filter((c) => c.id !== contact2Id).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer"
                            onClick={() => { setContact1Id(c.id); setSearch1(''); }}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">{getInitials(c.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.email || c.phone || ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Secondary Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge className="text-xs bg-amber-100 text-amber-900">Secondary</Badge>
                  Contact to Merge
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contact2 ? (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{getInitials(contact2.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{contact2.name}</p>
                      <p className="text-xs text-muted-foreground">{contact2.email || contact2.phone || ''}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => { setContact2Id(''); setSearch2(''); }}>Change</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search contacts..."
                        value={search2}
                        onChange={(e) => setSearch2(e.target.value)}
                        className="pl-9 h-9"
                      />
                    </div>
                    {search2 && searchResults2.length > 0 && (
                      <div className="border rounded-lg max-h-48 overflow-auto">
                        {searchResults2.filter((c) => c.id !== contact1Id).map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-3 p-2 hover:bg-muted/50 cursor-pointer"
                            onClick={() => { setContact2Id(c.id); setSearch2(''); }}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">{getInitials(c.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">{c.email || c.phone || ''}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Field-by-Field Comparison */}
          {bothSelected && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Field-by-Field Selection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose which value to keep for each field. Click on a cell to select it.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Field</TableHead>
                      <TableHead>Primary (Keep)</TableHead>
                      <TableHead>Secondary (Merge)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {MERGE_FIELDS.map((f) => (
                      <TableRow key={f.key}>
                        <TableCell className="text-sm font-medium">{f.label}</TableCell>
                        <TableCell
                          className={cn(
                            'text-sm cursor-pointer transition-colors',
                            fieldSelection[f.key] === 'primary' ? 'bg-blue-50 dark:bg-blue-900/20 font-semibold' : 'hover:bg-muted/50',
                          )}
                          onClick={() => setFieldSelection((prev) => ({ ...prev, [f.key]: 'primary' }))}
                        >
                          <div className="flex items-center gap-2">
                            {fieldSelection[f.key] === 'primary' && <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />}
                            {getFieldValue(contact1, f.key)}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-sm cursor-pointer transition-colors',
                            fieldSelection[f.key] === 'secondary' ? 'bg-amber-50 dark:bg-amber-900/20 font-semibold' : 'hover:bg-muted/50',
                          )}
                          onClick={() => setFieldSelection((prev) => ({ ...prev, [f.key]: 'secondary' }))}
                        >
                          <div className="flex items-center gap-2">
                            {fieldSelection[f.key] === 'secondary' && <CheckCircle2 className="h-4 w-4 text-amber-600 shrink-0" />}
                            {getFieldValue(contact2, f.key)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirm Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Merge</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will merge <strong>{contact2?.name}</strong> into <strong>{contact1?.name}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              The secondary contact will be deleted and all associated data (leads, follow-ups, etc.) will be transferred to the primary contact.
            </p>
            <p className="text-sm font-medium text-destructive">This action cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)} disabled={isMerging}>Cancel</Button>
            <Button onClick={handleMerge} disabled={isMerging}>
              {isMerging && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Confirm Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
