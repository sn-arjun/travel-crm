# TravelCRM Desktop — Foundation Contract

Reference for all slice jobs. Build against this; do not read foundation source.

## 1. Import paths

```ts
// Archetypes + relation picker
import { ListPage, EntityForm, FormRow, DetailPage, RelationCombobox } from '@/components/domain';
// Also: FilterBar, ActivityTimeline, StatCard, PipelineCard, KanbanBoard, FileUpload

// Primitives (all 50+)
import {
  Button, Input, Select, Combobox, Table, Dialog, Sheet, Tabs, Badge, Card, Checkbox,
  Switch, Textarea, Tooltip, Popover, DropdownMenu, Command, CommandPalette, DatePicker,
  CurrencyInput, PhoneInput, AddressAutocomplete, RichTextEditor, MultiStepWizard,
  EmptyState, Skeleton, Spinner, Progress, Avatar, Alert, Accordion, Collapsible,
  ScrollArea, Separator, Label, FormField, AspectRatio, CountdownBadge,
  // Added in foundation:
  DataTable, Pagination, PageHeader, SectionCard, Stat, Toolbar, ConfirmDialog, useConfirm,
  FileDropzone, Timeline, Tag, Kbd, SplitButton, LineChart, AreaChart, BarChart, PieChart,
} from '@/components/ui';

import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useThemeTokens } from '@/design-system/tokens/use-theme-tokens'; // Recharts/jsPDF/canvas
import type { ApiResponse, PaginatedResponse } from '@/lib/api/client'; // never redefine these
```

## 2. Props interfaces

```ts
interface ListPageProps<T> {
  title: string; description?: string;
  columns: DataTableColumn<T>[]; getRowId: (row: T) => string;
  fetcher: (p: { page: number; limit: number; search: string; filters: ListFilter[] }) => Promise<unknown>;
  extractItems?: (r: unknown) => T[];        // default: r.data | r.data.data
  extractTotal?: (r: unknown) => number;     // default: r.data.pagination.total
  primaryAction?: React.ReactNode; headerActions?: React.ReactNode;
  searchPlaceholder?: string; filters?: ListFilter[];
  onRemoveFilter?: (id: string) => void; onClearFilters?: () => void; onOpenFilters?: () => void;
  rowActions?: (row: T) => React.ReactNode;
  renderDetail?: (row: T) => React.ReactNode; detailTitle?: (row: T) => string;
  onRowClick?: (row: T) => void;             // use instead of renderDetail to navigate
  bulkActions?: BulkAction<T>[];             // presence enables row selection
  onExport?: (rows: T[]) => void | Promise<void>; exportLabel?: string;
  emptyTitle?: string; emptyDescription?: string; emptyIcon?: React.ReactNode; emptyAction?: React.ReactNode;
  limit?: number; className?: string;
}
interface ListFilter { id: string; label: string; value: string }
interface BulkAction<T> { label: string; icon?: React.ReactNode; onSelect: (rows: T[]) => void | Promise<void>; destructive?: boolean }

interface EntityFormProps<T extends FieldValues> {
  title: string; description?: string;
  schema: ZodType<T>; defaultValues: DefaultValues<T>;
  onSubmit: SubmitHandler<T>; onCancel?: () => void;
  prefillFromParams?: Partial<Record<string, Path<T>>>;   // '?contactId=x' -> field
  sections?: FormSection[];                                // simple case
  renderSections?: (form: UseFormReturn<T>) => React.ReactNode; // needs control/register
  submitLabel?: string; cancelLabel?: string;
  loading?: boolean; error?: string; className?: string;
}
interface FormSection { title: string; description?: string; required?: boolean; children: React.ReactNode }
interface FormRowProps { name: string; label: string; required?: boolean; hint?: string; wide?: boolean; children: React.ReactNode }

interface DetailPageProps<T> {
  entity: T; title: string; subtitle?: string; status?: React.ReactNode;
  onBack?: () => void; actions?: DetailAction[]; primaryActions?: React.ReactNode;
  overview: React.ReactNode;                 // Overview tab (always shown)
  activity?: TimelineItem[]; activityLoading?: boolean;  // omit -> tab hidden
  related?: RelatedList[];                                // omit -> tab hidden
  documents?: React.ReactNode;                            // omit -> tab hidden
  messaging?: { recipientId: string; recipientName: string; email?: string; phone?: string };
  className?: string;
}
interface DetailAction { label: string; onSelect: () => void; icon?: React.ReactNode; disabled?: boolean; destructive?: boolean; separatorBefore?: boolean }
interface RelatedList { title: string; content: React.ReactNode; action?: React.ReactNode }

interface RelationComboboxProps<T> {
  value: string | null;
  onChange: (id: string | null, item: T | null) => void;
  fetcher: (query: string, page: number) => Promise<{ items: T[]; total: number }>;
  getOptionId: (i: T) => string; getOptionLabel: (i: T) => string;
  getOptionDescription?: (i: T) => string | undefined;
  resolveSelected?: (id: string) => Promise<T | null>;   // label for preset value on edit forms
  placeholder?: string; searchPlaceholder?: string; emptyText?: string;
  disabled?: boolean; required?: boolean; error?: string;
  onCreateNew?: (query: string) => void; createNewLabel?: string;
  pageSize?: number; className?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]; data: T[]; getRowId: (row: T) => string;
  loading?: boolean; emptyState?: React.ReactNode;
  sortColumn?: string; sortDirection?: 'asc' | 'desc';
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  selectable?: boolean; selectedIds?: Set<string>; onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void; rowActions?: (row: T) => React.ReactNode; // actions show on hover
  stickyHeader?: boolean; showColumnVisibility?: boolean;
  virtualize?: boolean;      // default: data.length > 200
  maxHeight?: number; className?: string; caption?: string;
}
interface DataTableColumn<T> {
  key: string; header: string;
  cell?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean; width?: string; align?: 'left' | 'center' | 'right';
  hideable?: boolean; defaultHidden?: boolean;
}

interface PageHeaderProps {
  title: string; description?: string;
  count?: number;              // total-count badge
  status?: React.ReactNode; breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode; back?: React.ReactNode;
  sticky?: boolean; className?: string;
}
interface Breadcrumb { label: string; href?: string }
```

## 3. Token names

Use Tailwind classes: `bg-ds-*`, `text-ds-*`, `border-ds-*`, `p-ds-*`, `gap-ds-*`, `rounded-ds-*`, `shadow-ds-*`.

- **Surface:** `background`, `surface`, `surface-raised`, `surface-sunken`
- **Border:** `border`, `border-strong`
- **Foreground:** `foreground`, `foreground-muted`, `foreground-subtle`
- **Accents:** `primary`, `success`, `warning`, `danger`, `info` — each with `-hover`, `-active`, `-subtle`, `-foreground` (text on the solid fill), `-on-subtle` (text on the subtle fill)
- **Focus:** `ring` → `focus-visible:ring-2 focus-visible:ring-ds-ring`
- **Charts:** `chart-1`…`chart-6`
- **Spacing** (8pt): `ds-0 ds-1 ds-2 ds-3 ds-4 ds-5 ds-6 ds-7 ds-8 ds-9 ds-10` = 0,4,8,12,16,24,32,48,64,80px
- **Radius:** `ds-none ds-sm ds-md ds-lg ds-xl ds-2xl ds-full`
- **Elevation:** `shadow-ds-1`…`shadow-ds-5`
- **Motion:** `var(--ds-duration-{instant,fast,base,slow,slower,slowest})`, `var(--ds-ease-{standard,decelerate,accelerate,spring})`
- **Z-index:** `var(--ds-z-{base,sticky,dropdown,overlay,modal,popover,toast,command,tooltip})`

Every token has a light and dark value; all fg/bg pairs are ≥4.5:1 (enforced by `contrast.test.ts`).

## 4. Field-type rules (enforced)

| Field kind | Component | Key props |
|---|---|---|
| Relation / foreign key | `RelationCombobox` — **never** a text/ID input | `value, onChange, fetcher, getOptionId, getOptionLabel` |
| Phone / mobile | `PhoneInput` | `value: string, onChange: (v: string) => void, countryCode?, onCountryCodeChange?` |
| Address | `AddressAutocomplete` (falls back to plain input without `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) | `value: string, onChange, onAddressSelect?` |
| Money / amount | `CurrencyInput` | `value: number \| undefined, onChange: (v: number \| undefined) => void, currency?='INR'` |
| Date | `DatePicker` | `value?: Date, onChange: (d: Date \| undefined) => void, minDate?, maxDate?` |
| Outbound message | `SendMessageDialog` — **never** `mailto:`/`wa.me`/`tel:` | `open, onOpenChange, contact: { id, name, email?, phone? }, defaultChannel?` |

## 5. Feature gates

```tsx
const { enabled, reason, upgradeHref, loading } = useFeatureGate('voip_calling');
// features: 'voip_calling' | 'ai_assistant' | 'ai_extraction' | 'ai_intelligence' | 'ai_chatbot' | 'whatsapp_campaigns'
if (loading) return <Skeleton className="h-9 w-32" />;          // never show a gate while loading
if (!enabled) return <Button disabled>{reason === 'cap_exceeded' ? 'Limit reached' : 'Upgrade to enable'}</Button>;
return <ClickToCallButton />;
```
`reason`: `'ok' | 'not_in_plan' | 'cap_exceeded'`. Gated surfaces must not call the endpoint — a 403 must never surface as an error toast.

## 6. Worked example — list page

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag } from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@/lib/api/leads';

export default function LeadsPage() {
  const router = useRouter();
  return (
    <ListPage<Lead>
      title="Leads"
      description="Track and convert your pipeline."
      getRowId={(l) => l.id}
      fetcher={({ page, limit, search }) => leadsApi.list({ page, limit, search })}
      columns={[
        { key: 'name', header: 'Name', sortable: true, hideable: false },
        { key: 'company', header: 'Company', sortable: true },
        { key: 'status', header: 'Status', cell: (l) => (
            <Tag tone={l.status === 'won' ? 'success' : l.status === 'lost' ? 'danger' : 'info'}>
              {l.status}
            </Tag>
          ) },
        { key: 'value', header: 'Value', align: 'right', sortable: true,
          cell: (l) => l.value?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/leads/new')}>
          <Plus aria-hidden="true" /> New lead
        </Button>
      }
      rowActions={(l) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="Edit"
            onClick={() => router.push(`/leads/${l.id}/edit`)}><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete"
            onClick={() => void leadsApi.remove(l.id)}><Trash2 /></Button>
        </>
      )}
      onRowClick={(l) => router.push(`/leads/${l.id}`)}
      bulkActions={[{ label: 'Delete', destructive: true,
        onSelect: (rows) => Promise.all(rows.map((r) => leadsApi.remove(r.id))).then(() => {}) }]}
      onExport={(rows) => exportLeadsCsv(rows)}
      emptyTitle="No leads yet"
      emptyDescription="Start building your pipeline by adding your first lead."
    />
  );
}
```

## 7. Worked example — form

```tsx
'use client';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import { CurrencyInput, Input, SectionCard } from '@/components/ui';
import { contactsApi } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  contactId: z.string().min(1, 'Pick a contact'),
  value: z.number().optional(),
  closeDate: z.date().optional(),
});
type LeadForm = z.infer<typeof schema>;

export default function NewLeadPage() {
  const router = useRouter();
  return (
    <EntityForm<LeadForm>
      title="New lead"
      schema={schema}
      defaultValues={{ title: '', contactId: '', value: undefined, closeDate: undefined }}
      prefillFromParams={{ contactId: 'contactId' }}   // /leads/new?contactId=abc
      onCancel={() => router.back()}
      onSubmit={async (v) => { await leadsApi.create(v); router.push('/leads'); }}
      renderSections={(form) => (
        <SectionCard title="Details" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="title" label="Title" required>
              <Input {...form.register('title')} id="title" />
            </FormRow>
            <FormRow name="contactId" label="Contact" required>
              <RelationCombobox
                value={form.watch('contactId') || null}
                onChange={(id) => form.setValue('contactId', id ?? '', { shouldDirty: true })}
                fetcher={async (q, page) => {
                  const r = await contactsApi.list({ search: q, page, limit: 20 });
                  return { items: r.data, total: r.pagination.total };
                }}
                getOptionId={(c) => c.id}
                getOptionLabel={(c) => c.name}
                getOptionDescription={(c) => c.email ?? undefined}
                resolveSelected={async (id) => (await contactsApi.get(id)).data}
                error={form.formState.errors.contactId?.message}
              />
            </FormRow>
            <FormRow name="value" label="Deal value">
              <CurrencyInput value={form.watch('value')}
                onChange={(v) => form.setValue('value', v, { shouldDirty: true })} />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
```

## 8. Lint rules (build fails on these)

1. **No raw hex / `rgb()` / `NNpx`** in `src/**` outside `src/design-system/`. Use token classes (`bg-ds-surface`, `p-ds-4`) or import from `@/design-system/tokens`. Applies to string literals *and* template literals.
2. **No `@/lib/api` imports inside `src/components/ui/`.** Primitives are domain-free — pass data via props, or put the component in `components/domain/`.
3. **No `mailto:` / `wa.me/` / `api.whatsapp.com/send` / `tel:`** anywhere in `src/**`. Use `SendMessageDialog`.
4. **User-facing copy** belongs in `src/design-system/copy/` (warn-level on bare JSX text in `app/` and `components/domain/`).

Exempt: `src/design-system/**`, `**/*.test.*`, `**/*.config.*`, `e2e/**`, `electron/**`.

## 9. Graceful degradation

Nothing may crash on a missing env var. Google Places, realtime WebSocket, AI, VoIP and messaging each render a disabled state or manual fallback instead. `RelationCombobox` shows "Could not load options." on fetch failure rather than throwing.
