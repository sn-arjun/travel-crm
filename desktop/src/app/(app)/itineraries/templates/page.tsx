'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, FileText, MapPin, Plus, Trash2, Users } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Input, Label, Textarea, useConfirm } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { DataTableColumn } from '@/components/ui/data-table';
import {
  itineraryTemplatesApi, templateDays, errorMessage, ITINERARY_TEMPLATE_CATEGORIES,
  type ItineraryTemplate, type ItineraryTemplateCategory,
} from '@/lib/api/itineraries';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';
import { toast } from 'sonner';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { LeadCombobox } from '../_components/lead-combobox';
import { TemplateBandsDialog } from './_components/template-bands-dialog';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { usePermission } from '@/hooks/use-permission';
import { parseAgesText } from '@/lib/age-bands';
import { useT } from '@/lib/i18n';

const MAX_TEMPLATE_DAYS = 60;

function exportTemplatesCsv(rows: ItineraryTemplate[]) {
  const header = ['Title', 'Category', 'Destination', 'Duration (days)', 'Created'];
  const lines = rows.map((t) => [
    t.title,
    t.category ?? '',
    t.destination ?? '',
    t.durationDays != null ? String(t.durationDays) : '',
    formatDisplayDate(t.createdAt),
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `itinerary-templates-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ItineraryTemplatesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const t = useT();
  // Age-band pricing (R149): the template's bands and lines, and who is travelling when a quote is made from it.
  const bandsGate = useFeatureGate('age_band_pricing');
  const canEditTemplates = usePermission('itineraries', 'edit');
  const [bandsOpen, setBandsOpen] = React.useState(false);
  const [partyAdults, setPartyAdults] = React.useState('');
  const [partyAges, setPartyAges] = React.useState('');
  const [selectedTemplate, setSelectedTemplate] = React.useState<ItineraryTemplate | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Use template -> create itinerary
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newLeadId, setNewLeadId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // New template
  const [isNewTemplateOpen, setIsNewTemplateOpen] = React.useState(false);
  const [tplTitle, setTplTitle] = React.useState('');
  const [tplDestination, setTplDestination] = React.useState('');
  const [tplCategory, setTplCategory] = React.useState<ItineraryTemplateCategory | ''>('');
  const [tplDescription, setTplDescription] = React.useState('');
  const [tplDays, setTplDays] = React.useState(3);
  const [tplOutline, setTplOutline] = React.useState<string[]>(['', '', '']);
  const [tplErrors, setTplErrors] = React.useState<{ title?: string; days?: string }>({});
  const [isSavingTemplate, setIsSavingTemplate] = React.useState(false);

  async function openPreview(t: ItineraryTemplate) {
    setSelectedTemplate(t);
    try {
      const full = unwrapEntity<ItineraryTemplate>(await itineraryTemplatesApi.getById(t.id));
      if (full?.id) setSelectedTemplate(full);
    } catch {
      // The list row is enough to show the basics; the day count falls back to 0
    }
  }

  /** Who is travelling, when the user filled it in: the quote then gets its band quantities straight away. */
  function partyPayload(): { adults?: number; ages?: number[] } {
    if (!bandsGate.enabled) return {};
    const ages = parseAgesText(partyAges);
    const adults = Number(partyAdults);
    const hasAdults = partyAdults.trim() !== '' && Number.isInteger(adults) && adults >= 0;
    if (!hasAdults && ages.length === 0) return {};
    return { ...(hasAdults ? { adults } : {}), ages };
  }

  async function handleCreateFromTemplate() {
    if (!selectedTemplate || !newTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!newLeadId) {
      toast.error('Please select a lead');
      return;
    }

    setIsCreating(true);
    try {
      const result = unwrapEntity<{ id?: string }>(
        await itineraryTemplatesApi.createFrom({
          templateId: selectedTemplate.id,
          leadId: newLeadId,
          title: newTitle.trim(),
          ...partyPayload(),
        }),
      );
      toast.success('Itinerary created from template');
      setIsCreateDialogOpen(false);
      setSelectedTemplate(null);
      setNewLeadId(null);
      router.push(result?.id ? `/itineraries/${result.id}` : '/itineraries');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create itinerary'));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(template: ItineraryTemplate) {
    const ok = await confirm({
      title: 'Delete template',
      description: `Delete "${template.title}"? This cannot be undone.`,
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await itineraryTemplatesApi.delete(template.id);
      toast.success('Template deleted');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete template'));
    }
  }

  function resetNewTemplate() {
    setTplTitle('');
    setTplDestination('');
    setTplCategory('');
    setTplDescription('');
    setTplDays(3);
    setTplOutline(['', '', '']);
    setTplErrors({});
  }

  function changeTemplateDays(raw: string) {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return;
    const days = Math.min(MAX_TEMPLATE_DAYS, Math.max(1, n));
    setTplDays(days);
    setTplOutline((prev) => Array.from({ length: days }, (_, i) => prev[i] ?? ''));
    setTplErrors((e) => ({ ...e, days: undefined }));
  }

  async function handleSaveTemplate() {
    const errors: { title?: string; days?: string } = {};
    if (!tplTitle.trim()) errors.title = 'Enter a template name';
    if (!Number.isInteger(tplDays) || tplDays < 1) errors.days = 'Enter at least 1 day';
    setTplErrors(errors);
    if (errors.title || errors.days) {
      toast.error('Please fix the highlighted fields');
      return;
    }

    const templateData = JSON.stringify({
      days: tplOutline.map((title, i) => ({
        dayNumber: i + 1,
        title: title.trim() || `Day ${i + 1}`,
        description: '',
        city: tplDestination.trim() || undefined,
        items: [],
      })),
      inclusions: [],
      exclusions: [],
      termsConditions: '',
    });

    setIsSavingTemplate(true);
    try {
      await itineraryTemplatesApi.create({
        title: tplTitle.trim(),
        description: tplDescription.trim() || null,
        destination: tplDestination.trim() || null,
        durationDays: tplDays,
        category: tplCategory || null,
        templateData,
      });
      toast.success('Template created');
      setIsNewTemplateOpen(false);
      resetNewTemplate();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create template'));
    } finally {
      setIsSavingTemplate(false);
    }
  }

  const columns: DataTableColumn<ItineraryTemplate>[] = [
    { key: 'title', header: 'Title', sortable: true, hideable: false },
    {
      key: 'category',
      header: 'Category',
      cell: (t) => (t.category ? <Tag>{t.category}</Tag> : <span className="text-ds-foreground-subtle">—</span>),
    },
    {
      key: 'destination',
      header: 'Destination',
      cell: (t) =>
        t.destination ? (
          <span className="flex items-center gap-ds-1 text-sm">
            <MapPin className="size-3.5 text-ds-foreground-subtle" aria-hidden="true" />
            {t.destination}
          </span>
        ) : (
          <span className="text-ds-foreground-subtle">—</span>
        ),
    },
    {
      key: 'durationDays',
      header: 'Duration',
      align: 'right',
      cell: (t) => (t.durationDays ? `${t.durationDays} days` : '—'),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (t) => formatDisplayDate(t.createdAt),
    },
  ];

  const previewDays = selectedTemplate ? templateDays(selectedTemplate) : [];

  return (
    <>
      <ListPage<ItineraryTemplate>
        title="Itinerary Templates"
        description="Reusable itinerary blueprints you can turn into new itineraries."
        getRowId={(t) => t.id}
        refreshKey={refreshKey}
        primaryAction={
          <Button onClick={() => { resetNewTemplate(); setIsNewTemplateOpen(true); }}>
            <Plus className="me-ds-1" aria-hidden="true" /> New template
          </Button>
        }
        fetcher={({ page, limit, search }) =>
          itineraryTemplatesApi.list({ page, limit, search: search || undefined })
        }
        columns={columns}
        searchPlaceholder="Search templates…"
        rowActions={(t) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Preview"
              onClick={(e) => {
                e.stopPropagation();
                void openPreview(t);
              }}
            >
              <Eye aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Use template"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedTemplate(t);
                setNewTitle(`${t.title} - Copy`);
                setIsCreateDialogOpen(true);
              }}
            >
              <Copy aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(t);
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        onRowClick={(t) => void openPreview(t)}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: 'Delete templates',
                description: `Delete ${rows.length} template${rows.length === 1 ? '' : 's'}? This cannot be undone.`,
                tone: 'destructive',
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => itineraryTemplatesApi.delete(r.id).catch(() => null)));
              toast.success('Templates deleted');
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            // Export the full filtered dataset, not just the loaded page.
            const res = await itineraryTemplatesApi.list({ page: 1, limit: 1000 });
            const all = unwrapList<ItineraryTemplate>(res).data;
            exportTemplatesCsv(all.length > 0 ? all : rows);
            toast.success('Templates exported');
          } catch {
            exportTemplatesCsv(rows);
          }
        }}
        emptyTitle="No templates yet"
        emptyDescription="Save an itinerary as a template from its detail page to reuse it later."
        emptyIcon={<FileText className="size-10" aria-hidden="true" />}
      />

      {/* Preview dialog */}
      <Dialog
        open={!!selectedTemplate && !isCreateDialogOpen && !bandsOpen}
        onOpenChange={(open) => !open && setSelectedTemplate(null)}
      >
        <DialogContent className="max-w-lg">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTemplate.title}</DialogTitle>
                <DialogDescription className="sr-only">Template preview</DialogDescription>
              </DialogHeader>
              <div className="space-y-ds-4">
                {selectedTemplate.description && (
                  <p className="text-sm text-ds-foreground-muted">{selectedTemplate.description}</p>
                )}
                <div className="grid grid-cols-2 gap-ds-4 text-sm">
                  <div>
                    <span className="text-ds-foreground-muted">Destination:</span>
                    <p className="font-medium">{selectedTemplate.destination || '—'}</p>
                  </div>
                  <div>
                    <span className="text-ds-foreground-muted">Duration:</span>
                    <p className="font-medium">
                      {selectedTemplate.durationDays ? `${selectedTemplate.durationDays} days` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-ds-foreground-muted">Days planned:</span>
                    <p className="font-medium">{previewDays.length} day items</p>
                  </div>
                </div>
                {previewDays.length > 0 && (
                  <ol className="max-h-48 space-y-ds-1 overflow-y-auto text-sm">
                    {previewDays.map((d, i) => (
                      <li key={i} className="flex gap-ds-2">
                        <span className="w-14 shrink-0 text-ds-foreground-muted">Day {d.dayNumber ?? i + 1}</span>
                        <span className="min-w-0 truncate">{d.title || '—'}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Close
                </Button>
                {bandsGate.enabled && canEditTemplates && (
                  <Button variant="outline" onClick={() => setBandsOpen(true)} data-testid="template-age-bands">
                    <Users className="me-ds-1" aria-hidden="true" /> {t('ageBands.template.open')}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setNewTitle(`${selectedTemplate.title} - Copy`);
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <Copy className="me-ds-1" aria-hidden="true" /> Use this template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create from template dialog */}
      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) { setNewLeadId(null); setPartyAdults(''); setPartyAges(''); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Itinerary from Template</DialogTitle>
            <DialogDescription className="sr-only">Choose a title and a lead for the new itinerary</DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-4">
            <p className="text-sm text-ds-foreground-muted">
              Creating from: <strong>{selectedTemplate?.title}</strong>
            </p>
            <div className="space-y-ds-2">
              <Label htmlFor="newTitle">Itinerary title *</Label>
              <Input
                id="newTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter title for the new itinerary"
              />
            </div>
            <div className="space-y-ds-2">
              <Label>Link to lead *</Label>
              <LeadCombobox value={newLeadId} onChange={setNewLeadId} required aria-label="Link to lead" />
            </div>
            {bandsGate.enabled && (
              <div className="space-y-ds-2" data-testid="create-party">
                <p className="text-sm font-medium">{t('ageBands.create.title')}</p>
                <div className="grid gap-ds-3 sm:grid-cols-[7rem_1fr]">
                  <div className="space-y-ds-1">
                    <Label htmlFor="partyAdults">{t('ageBands.create.adults')}</Label>
                    <Input id="partyAdults" type="number" min={0} value={partyAdults} onChange={(e) => setPartyAdults(e.target.value)} />
                  </div>
                  <div className="space-y-ds-1">
                    <Label htmlFor="partyAges">{t('ageBands.create.ages')}</Label>
                    <Input id="partyAges" value={partyAges} onChange={(e) => setPartyAges(e.target.value)} placeholder={t('ageBands.create.agesPlaceholder')} />
                  </div>
                </div>
                <p className="text-xs text-ds-foreground-muted">{t('ageBands.create.hint')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setNewLeadId(null);
              }}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleCreateFromTemplate()} disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Create itinerary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New template dialog */}
      <Dialog open={isNewTemplateOpen} onOpenChange={(open) => { if (!isSavingTemplate) setIsNewTemplateOpen(open); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New itinerary template</DialogTitle>
            <DialogDescription>
              Outline the days now. You can price each day when you create an itinerary from the template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="tplTitle">Template name *</Label>
              <Input
                id="tplTitle"
                value={tplTitle}
                onChange={(e) => { setTplTitle(e.target.value); setTplErrors((er) => ({ ...er, title: undefined })); }}
                placeholder="e.g. Kerala Backwaters & Hills - 5N/6D"
                aria-invalid={tplErrors.title ? true : undefined}
              />
              {tplErrors.title && <p role="alert" className="text-xs text-ds-danger">{tplErrors.title}</p>}
            </div>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <div className="space-y-ds-2">
                <Label htmlFor="tplDestination">Destination</Label>
                <Input
                  id="tplDestination"
                  value={tplDestination}
                  onChange={(e) => setTplDestination(e.target.value)}
                  placeholder="e.g. Kerala"
                />
              </div>
              <div className="space-y-ds-2">
                <Label htmlFor="tplCategory">Category</Label>
                <Select value={tplCategory} onValueChange={(v) => setTplCategory(v as ItineraryTemplateCategory)}>
                  <SelectTrigger id="tplCategory"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>
                    {ITINERARY_TEMPLATE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="tplDescription">Description</Label>
              <Textarea
                id="tplDescription"
                value={tplDescription}
                onChange={(e) => setTplDescription(e.target.value)}
                placeholder="What makes this package special?"
                rows={2}
              />
            </div>
            <div className="space-y-ds-2">
              <div className="flex items-end gap-ds-3">
                <div className="w-32 space-y-ds-2">
                  <Label htmlFor="tplDays">Days *</Label>
                  <Input
                    id="tplDays"
                    type="number"
                    min={1}
                    max={MAX_TEMPLATE_DAYS}
                    value={tplDays}
                    onChange={(e) => changeTemplateDays(e.target.value)}
                    aria-invalid={tplErrors.days ? true : undefined}
                  />
                </div>
                <p className="pb-ds-2 text-sm text-ds-foreground-muted">
                  {Math.max(0, tplDays - 1)} nights / {tplDays} days
                </p>
              </div>
              {tplErrors.days && <p role="alert" className="text-xs text-ds-danger">{tplErrors.days}</p>}
            </div>
            <div className="space-y-ds-2">
              <Label>Day outline</Label>
              <div className="max-h-56 space-y-ds-2 overflow-y-auto pe-ds-1">
                {tplOutline.map((title, i) => (
                  <div key={i} className="flex items-center gap-ds-2">
                    <span className="w-14 shrink-0 text-sm text-ds-foreground-muted">Day {i + 1}</span>
                    <Input
                      value={title}
                      onChange={(e) => setTplOutline((prev) => prev.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder={i === 0 ? 'e.g. Arrive and transfer to hotel' : `Day ${i + 1} title`}
                      aria-label={`Day ${i + 1} title`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewTemplateOpen(false)} disabled={isSavingTemplate}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveTemplate()} disabled={isSavingTemplate}>
              {isSavingTemplate ? 'Saving…' : 'Create template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplateBandsDialog
        template={selectedTemplate}
        open={bandsOpen}
        onOpenChange={setBandsOpen}
        onSaved={() => { if (selectedTemplate) void openPreview(selectedTemplate); setRefreshKey((k) => k + 1); }}
      />

      {confirmDialog}
    </>
  );
}
