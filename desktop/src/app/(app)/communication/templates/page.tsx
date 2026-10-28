'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Mail, MessageSquare, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage, DetailPage } from '@/components/domain';
import {
  Button, Badge, Sheet, SheetContent, useConfirm,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useApiMutation } from '@/hooks/use-api';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';

const CHANNEL_ICON: Record<MessageTemplate['channel'], React.ReactNode> = {
  email: <Mail className="h-3 w-3" />,
  sms: <Phone className="h-3 w-3" />,
  whatsapp: <MessageSquare className="h-3 w-3" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  greeting: 'Greeting / Welcome',
  follow_up: 'Follow-up',
  quotation: 'Quotation / Proposal',
  booking: 'Booking Confirmation',
  reminder: 'Payment Reminder',
  wish: 'Thank You / Wish',
  offer: 'Promotional / Offer',
  visa: 'Visa / Travel Docs',
};

function toCsv(rows: MessageTemplate[]) {
  const header = ['Name', 'Channel', 'Category', 'Language', 'Subject', 'Content'];
  const lines = rows.map((t) => [
    t.name,
    t.channel,
    t.category ?? '',
    t.language,
    t.subject ?? '',
    t.content.replace(/\n/g, ' '),
  ]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(','));
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TemplatesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [detailTemplate, setDetailTemplate] = React.useState<MessageTemplate | null>(null);
  const [channelFilter, setChannelFilter] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState('');

  const { mutate: deleteTemplate } = useApiMutation((id: string) => templatesApi.delete(id));
  const { mutate: createDuplicate } = useApiMutation((tpl: MessageTemplate) =>
    templatesApi.create({
      channel: tpl.channel,
      name: `${tpl.name} (Copy)`,
      subject: tpl.subject,
      content: tpl.content,
      category: tpl.category,
      language: tpl.language,
    }));

  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const handleDelete = async (tpl: MessageTemplate) => {
    const ok = await confirm({
      title: 'Delete template',
      description: `Delete "${tpl.name}"? This action cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await deleteTemplate(tpl.id);
    if (result) {
      toast.success(`Template "${tpl.name}" deleted`);
      reload();
    } else {
      toast.error('Failed to delete template');
    }
  };

  const handleDuplicate = async (tpl: MessageTemplate) => {
    const result = await createDuplicate(tpl);
    if (result) {
      toast.success('Template duplicated');
      reload();
    } else {
      toast.error('Failed to duplicate template');
    }
  };

  return (
    <>
      <ListPage<MessageTemplate>
        refreshKey={reloadKey}
        title="Message Templates"
        description="Reusable email, SMS and WhatsApp content for your team."
        getRowId={(t) => t.id}
        fetcher={({ page, limit, search }) =>
          templatesApi.list({
            search: search || undefined,
            channel: channelFilter || undefined,
            category: categoryFilter || undefined,
            page,
            limit,
          })}
        searchPlaceholder="Search templates..."
        filters={[
          ...(channelFilter ? [{ id: 'channel', label: 'Channel', value: channelFilter }] : []),
          ...(categoryFilter ? [{ id: 'category', label: 'Category', value: categoryFilter }] : []),
        ]}
        onRemoveFilter={(id) => {
          if (id === 'channel') setChannelFilter('');
          if (id === 'category') setCategoryFilter('');
        }}
        onClearFilters={() => { setChannelFilter(''); setCategoryFilter(''); }}
        headerActions={
          <div className="flex items-center gap-ds-2">
            <Select value={channelFilter || 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="All Channels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Channels</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        columns={[
          { key: 'name', header: 'Name', sortable: true },
          {
            key: 'channel',
            header: 'Channel',
            cell: (t) => (
              <Badge variant="outline" className="gap-1">
                {CHANNEL_ICON[t.channel]}
                {t.channel.toUpperCase()}
              </Badge>
            ),
          },
          {
            key: 'category',
            header: 'Category',
            cell: (t) => (t.category ? <Badge variant="secondary">{CATEGORY_LABELS[t.category] ?? t.category}</Badge> : '—'),
          },
          {
            key: 'language',
            header: 'Language',
            cell: (t) => t.language?.toUpperCase() ?? 'EN',
          },
          {
            key: 'content',
            header: 'Preview',
            cell: (t) => (
              <span className="line-clamp-1 text-ds-foreground-muted">
                {t.subject ? `[${t.subject}] ` : ''}
                {t.content}
              </span>
            ),
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/communication/templates/new')}>
            <Plus aria-hidden="true" /> Create Template
          </Button>
        }
        rowActions={(t) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="Preview" onClick={() => setDetailTemplate(t)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Duplicate" onClick={() => void handleDuplicate(t)}>
              <Copy />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit"
              onClick={() => router.push(`/communication/templates/${t.id}/edit`)}
            >
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(t)}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(t) => setDetailTemplate(t)}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: 'Delete templates',
                description: `Delete ${rows.length} template(s)? This action cannot be undone.`,
                confirmLabel: 'Delete',
                tone: 'destructive',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => templatesApi.delete(r.id)));
              toast.success(`${rows.length} template(s) deleted`);
              reload();
            },
          },
        ]}
        onExport={async (rows) => downloadCsv(toCsv(rows), 'message-templates.csv')}
        exportLabel="Export CSV"
        emptyTitle="No templates yet"
        emptyDescription="Create your first message template to get started."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/communication/templates/new')}>
            <Plus aria-hidden="true" /> Create Template
          </Button>
        }
      />

      <Sheet open={!!detailTemplate} onOpenChange={(open) => !open && setDetailTemplate(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          {detailTemplate && (
            <DetailPage
              entity={detailTemplate}
              title={detailTemplate.name}
              subtitle={detailTemplate.category ? CATEGORY_LABELS[detailTemplate.category] ?? detailTemplate.category : undefined}
              status={
                <Badge variant="outline" className="gap-1">
                  {CHANNEL_ICON[detailTemplate.channel]}
                  {detailTemplate.channel.toUpperCase()}
                </Badge>
              }
              actions={[
                { label: 'Edit', icon: <Pencil />, onSelect: () => router.push(`/communication/templates/${detailTemplate.id}/edit`) },
                { label: 'Duplicate', icon: <Copy />, onSelect: () => void handleDuplicate(detailTemplate) },
                {
                  label: 'Delete',
                  icon: <Trash2 />,
                  destructive: true,
                  separatorBefore: true,
                  onSelect: () => void handleDelete(detailTemplate),
                },
              ]}
              overview={
                <div className="space-y-ds-4">
                  {detailTemplate.subject && (
                    <div>
                      <p className="text-ds-xs text-ds-foreground-subtle mb-ds-1">Subject</p>
                      <p className="text-ds-sm font-medium">{detailTemplate.subject}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-ds-xs text-ds-foreground-subtle mb-ds-1">Content</p>
                    <pre className="whitespace-pre-wrap rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-4 text-ds-sm font-sans leading-relaxed">
                      {detailTemplate.content}
                    </pre>
                  </div>
                  <div>
                    <p className="text-ds-xs text-ds-foreground-subtle mb-ds-1">Language</p>
                    <p className="text-ds-sm">{detailTemplate.language?.toUpperCase() ?? 'EN'}</p>
                  </div>
                </div>
              }
            />
          )}
        </SheetContent>
      </Sheet>
      {confirmDialog}
    </>
  );
}
