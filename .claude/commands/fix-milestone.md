# Phase 2: Fix Milestone

Read audit report and fix all gaps for milestone $ARGUMENTS.

## Input
Milestone number. Read `desktop/audit/M{N}-audit.md` as your ONLY source of truth.

## UX CONTRACT — MANDATORY

### List Pages
1. `FilterBar` — search + status/type dropdown + tag filter (from `@/components/domain/filter-bar`)
2. `useInfiniteScroll` — from `desktop/src/hooks/use-infinite-scroll.ts` (NOT load-all or manual page buttons)
3. `DataTable` — with hover action icons: Eye, Pencil, Phone, Mail, Trash2 (lucide-react)
4. Row click → detail drawer (Sheet/slide-over) with FULL actions (Edit, Call, WhatsApp, Email, Delete)
5. `EmptyState` component when list is empty
6. `Skeleton` loading during initial fetch
7. Count badge in header (e.g., "Contacts (247)")

### Form Pages
1. **Relation fields** → searchable `Combobox` calling list API with search param. Example:
   ```tsx
   // CORRECT: Searchable combobox for contact selection
   <Combobox
     options={contacts.map(c => ({ value: c.id, label: c.name }))}
     onSearch={(q) => searchContacts(q)}
     placeholder="Search contacts..."
   />
   // WRONG: Raw input where user types ID
   <Input name="contactId" placeholder="Enter contact ID" />
   ```
2. **Auto-populate from context**: Check URL searchParams for prefilled data:
   ```tsx
   const searchParams = useSearchParams();
   const prefillContactId = searchParams.get('contactId');
   const prefillContactName = searchParams.get('contactName');
   ```
3. `PhoneInput` for phone fields — `@/components/ui/phone-input`
4. `AddressAutocomplete` for address — `@/components/ui/address-autocomplete`
   - MUST check: `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - If missing: render plain Input fields with manual city/state/zip
5. `CurrencyInput` for money — `@/components/ui/currency-input`
6. `DatePicker` for dates — `@/components/ui/date-picker`
7. Inline validation with error messages below fields
8. Required fields marked with red asterisk

### Detail Pages
1. PageHeader: title + status Badge + actions dropdown
2. Tabs: Overview | Activity | Related | Documents
3. Communication via `SendMessageDialog` — NEVER mailto:/wa.me/tel:
4. Related entities list (Contact → Leads, Invoices, etc.)

### Env Fallbacks
Every env-dependent feature MUST have fallback:
```tsx
// CORRECT: Graceful degradation
const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
{mapsApiKey ? <AddressAutocomplete apiKey={mapsApiKey} /> : <ManualAddressFields />}

// WRONG: Crashes if env missing
<AddressAutocomplete apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} />
```

### Design System
- Primary: `#6366F1` (indigo-500)
- Success: `#10B981`, Warning: `#F59E0B`, Error: `#EF4444`
- Font: Inter (body), JetBrains Mono (data)
- Border radius: 6px default
- Spacing: 4px base grid

## Implementation Order
1. Backend schema + routes (if missing/broken)
2. API client methods (`desktop/src/lib/api/`)
3. Fix desktop pages — resolve every UX anti-pattern from audit
4. Add env fallbacks
5. Verify build: `cd desktop && npx next build`

## Rules
- Use EXISTING components before creating new ones
- Fix EXACTLY what the audit says — no scope creep
- Every fix must follow the UX contract above
- Run build check at the end
- Summarize all changes made
