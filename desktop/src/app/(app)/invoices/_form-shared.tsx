'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Combobox, CurrencyInput, Input } from '@/components/ui';
import type { RelationPage } from '@/components/domain/relation-combobox';
import { contactsApi } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { hsnCodesApi, type HsnCode } from '@/lib/api/hsn-codes';
import { unwrapList } from '@/lib/api/envelope';
import type { Contact, Lead } from '@travelcrm/shared';

export interface LineItem {
  id: number;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
}

export const GST_RATES = ['0', '5', '12', '18', '28'] as const;

export function newLineItem(id: number): LineItem {
  return { id, description: '', hsnCode: '', quantity: 1, unitPrice: 0 };
}

export async function fetchContactOptions(query: string, page: number): Promise<RelationPage<Contact>> {
  const res = unwrapList<Contact>(await contactsApi.list({ search: query || undefined, page, limit: 20 }));
  return { items: res.data, total: res.pagination.total };
}

export async function fetchLeadOptions(query: string, page: number): Promise<RelationPage<Lead>> {
  const res = unwrapList<Lead>(await leadsApi.list({ search: query || undefined, page, limit: 20 }));
  return { items: res.data, total: res.pagination.total };
}

export async function resolveContact(id: string): Promise<Contact | null> {
  return (await contactsApi.getById(id)).data ?? null;
}

export async function resolveLead(id: string): Promise<Lead | null> {
  return (await leadsApi.getById(id)).data ?? null;
}

interface LineItemsEditorProps {
  items: LineItem[];
  currency: string;
  priceErrors: Set<number>;
  onChange: (id: number, field: keyof LineItem, value: string | number | undefined) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
}

/** Description / HSN / quantity / unit price rows shared by the new and edit invoice forms. */
export function LineItemsEditor({ items, currency, priceErrors, onChange, onAdd, onRemove }: LineItemsEditorProps) {
  const [hsnSearch, setHsnSearch] = React.useState('');
  const [hsnCodes, setHsnCodes] = React.useState<HsnCode[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    hsnCodesApi
      .list({ search: hsnSearch || undefined })
      .then((r) => {
        if (cancelled) return;
        const body = r.data as unknown;
        const list = Array.isArray(body) ? (body as HsnCode[]) : ((body as { data?: HsnCode[] } | null)?.data ?? []);
        setHsnCodes(list);
      })
      .catch(() => setHsnCodes([]));
    return () => {
      cancelled = true;
    };
  }, [hsnSearch]);

  return (
    <div className="flex flex-col gap-ds-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ds-foreground-muted">At least one item with a description is required</span>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus aria-hidden="true" />
          Add Item
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_9rem_5rem_8rem_8rem_2rem] gap-ds-2 px-ds-1 text-xs font-medium text-ds-foreground-muted">
        <span>Description</span>
        <span>HSN/SAC</span>
        <span>Qty</span>
        <span>Unit price</span>
        <span className="text-right">Amount</span>
        <span />
      </div>
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1fr_9rem_5rem_8rem_8rem_2rem] items-start gap-ds-2">
          <Input
            placeholder="e.g., Flight tickets, Hotel booking..."
            aria-label="Description"
            value={item.description}
            onChange={(e) => onChange(item.id, 'description', e.target.value)}
          />
          <Combobox
            options={hsnCodes.map((h) => ({ value: h.code, label: `${h.code} — ${h.description}` }))}
            value={item.hsnCode}
            onValueChange={(v) => onChange(item.id, 'hsnCode', v)}
            onSearch={setHsnSearch}
            placeholder="HSN/SAC"
            searchPlaceholder="Search HSN codes..."
            className="h-9 text-xs"
          />
          <Input
            type="number"
            min={1}
            aria-label="Quantity"
            value={item.quantity}
            onChange={(e) => onChange(item.id, 'quantity', parseInt(e.target.value, 10) || 1)}
          />
          <div>
            <CurrencyInput
              value={item.unitPrice || undefined}
              onChange={(v) => onChange(item.id, 'unitPrice', v ?? 0)}
              currency={currency}
              placeholder="0"
              aria-label="Unit price"
              aria-invalid={priceErrors.has(item.id) || undefined}
            />
            {priceErrors.has(item.id) && (
              <p role="alert" className="mt-ds-1 text-xs text-ds-danger">
                Unit price must be greater than 0
              </p>
            )}
          </div>
          <Input
            aria-label="Line amount"
            value={(item.quantity * item.unitPrice).toLocaleString('en-IN')}
            readOnly
            className="bg-ds-surface-sunken text-right font-medium"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remove item"
            onClick={() => onRemove(item.id)}
            className="text-ds-foreground-muted hover:text-ds-danger"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}
