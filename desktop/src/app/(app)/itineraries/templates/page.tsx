'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, FileText, MapPin, Calendar, Wallet, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Input, Label, useConfirm } from '@/components/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { DataTableColumn } from '@/components/ui/data-table';
import { useApiMutation } from '@/hooks/use-api';
import { client, type ApiResponse, type PaginatedResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { toast } from 'sonner';

interface ItineraryTemplate {
  id: string;
  title: string;
  description?: string;
  destination?: string;
  duration?: number;
  budget?: number;
  category?: string;
  items?: unknown[];
  createdAt: string;
  updatedAt: string;
}

function exportTemplatesCsv(rows: ItineraryTemplate[]) {
  const header = ['Title', 'Category', 'Destination', 'Duration (days)', 'Budget', 'Created'];
  const lines = rows.map((t) => [
    t.title,
    t.category ?? '',
    t.destination ?? '',
    t.duration != null ? String(t.duration) : '',
    t.budget != null ? String(t.budget) : '',
    new Date(t.createdAt).toLocaleDateString('en-IN'),
  ]);
  const csv = [header, ...lines]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `itinerary-templates-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ItineraryTemplatesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [selectedTemplate, setSelectedTemplate] = React.useState<ItineraryTemplate | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');

  const { mutate: createFromTemplate, loading: isCreating } = useApiMutation<
    { templateId: string; title: string },
    ApiResponse<{ id: string }>
  >((data) => client.post<ApiResponse<{ id: string }>>(API_ENDPOINTS.itineraryTemplates.createFrom, data));

  const { mutate: deleteTemplate } = useApiMutation((id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.itineraryTemplates.byId(id)),
  );

  async function handleCreateFromTemplate() {
    if (!selectedTemplate || !newTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }

    const result = await createFromTemplate({ templateId: selectedTemplate.id, title: newTitle });

    if (result) {
      toast.success('Itinerary created from template');
      setIsCreateDialogOpen(false);
      setSelectedTemplate(null);
      const id = result.data?.id;
      router.push(id ? `/itineraries/${id}` : '/itineraries');
    } else {
      toast.error('Failed to create itinerary');
    }
  }

  async function handleDelete(template: ItineraryTemplate) {
    const ok = await confirm({
      title: 'Delete template',
      description: `Delete "${template.title}"? This cannot be undone.`,
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await deleteTemplate(template.id);
    if (result) {
      toast.success('Template deleted');
    } else {
      toast.error('Failed to delete template');
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
      key: 'duration',
      header: 'Duration',
      align: 'right',
      cell: (t) => (t.duration ? `${t.duration} days` : '—'),
    },
    {
      key: 'budget',
      header: 'Budget',
      align: 'right',
      sortable: true,
      cell: (t) => (t.budget != null ? t.budget.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) : '—'),
    },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (t) => new Date(t.createdAt).toLocaleDateString('en-IN'),
    },
  ];

  return (
    <>
      <ListPage<ItineraryTemplate>
        title="Itinerary Templates"
        description="Reusable itinerary blueprints you can turn into new itineraries."
        getRowId={(t) => t.id}
        fetcher={({ page, limit, search }) =>
          client.get<ApiResponse<PaginatedResponse<ItineraryTemplate>>>(API_ENDPOINTS.itineraryTemplates.list, {
            params: { page, limit, search: search || undefined },
          })
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
                setSelectedTemplate(t);
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
        onRowClick={(t) => setSelectedTemplate(t)}
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
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => deleteTemplate(r.id)));
              toast.success('Templates deleted');
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            // Export the full filtered dataset, not just the loaded page.
            const res = await client.get<ApiResponse<PaginatedResponse<ItineraryTemplate>>>(
              API_ENDPOINTS.itineraryTemplates.list,
              { params: { page: 1, limit: 1000 } },
            );
            const all = res.data?.data ?? rows;
            exportTemplatesCsv(all);
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
        open={!!selectedTemplate && !isCreateDialogOpen}
        onOpenChange={(open) => !open && setSelectedTemplate(null)}
      >
        <DialogContent className="max-w-lg">
          {selectedTemplate && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTemplate.title}</DialogTitle>
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
                      {selectedTemplate.duration ? `${selectedTemplate.duration} days` : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-ds-foreground-muted">Budget:</span>
                    <p className="font-medium">
                      {selectedTemplate.budget != null
                        ? selectedTemplate.budget.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-ds-foreground-muted">Items:</span>
                    <p className="font-medium">{selectedTemplate.items?.length ?? 0} day items</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    setNewTitle(`${selectedTemplate.title} - Copy`);
                    setIsCreateDialogOpen(true);
                  }}
                >
                  <Copy className="mr-ds-1" aria-hidden="true" /> Use this template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create from template dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Itinerary from Template</DialogTitle>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateFromTemplate} disabled={isCreating}>
              {isCreating ? 'Creating…' : 'Create itinerary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </>
  );
}
