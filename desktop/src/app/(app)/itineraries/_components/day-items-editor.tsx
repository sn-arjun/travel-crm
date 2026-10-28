'use client';

import { getLocaleContext } from '@/lib/locale';
import * as React from 'react';
import { BookOpen, Hotel, Plane, Car, Camera, Utensils, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { PER_PERSON, bandRange, type AgeBand } from '@/lib/age-bands';
import type { ItineraryItem } from '@/lib/api/itineraries';
import type { RateCard } from '@/lib/api/rate-cards';
import { RateCardPicker, rateCardSelling } from './rate-card-picker';

type ItemType = ItineraryItem['type'];

const TYPE_META: Record<ItemType, { label: string; icon: React.ElementType; tone: string }> = {
  hotel: { label: 'Hotel', icon: Hotel, tone: 'bg-ds-info-subtle text-ds-info-on-subtle' },
  transport: { label: 'Transport', icon: Car, tone: 'bg-ds-warning-subtle text-ds-warning-on-subtle' },
  activity: { label: 'Activity', icon: Camera, tone: 'bg-ds-success-subtle text-ds-success-on-subtle' },
  meal: { label: 'Meal', icon: Utensils, tone: 'bg-ds-danger-subtle text-ds-danger-on-subtle' },
  flight: { label: 'Flight', icon: Plane, tone: 'bg-ds-primary-subtle text-ds-primary-on-subtle' },
};

const ADD_ORDER: ItemType[] = ['hotel', 'transport', 'activity', 'meal', 'flight'];

interface DayItemsEditorProps {
  items: ItineraryItem[];
  onChange: (items: ItineraryItem[]) => void;
  currency?: string;
  /** The age bands in force for the quote; when given, each line can be priced by a band or per person (R149). */
  bands?: AgeBand[];
}

const FIXED = '__fixed';

/** Items of one itinerary day: edit name, quantity and prices, apply a rate card, add or remove. */
export function DayItemsEditor({ items, onChange, currency = getLocaleContext().currency, bands }: DayItemsEditorProps) {
  const t = useT();
  const [pickerIndex, setPickerIndex] = React.useState<number | null>(null);

  function patch(index: number, change: Partial<ItineraryItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));
  }

  function add(type: ItemType) {
    onChange([
      ...items,
      { type, title: '', quantity: 1, costPrice: 0, sellingPrice: 0, sortOrder: items.length },
    ]);
  }

  function applyRateCard(rc: RateCard) {
    if (pickerIndex === null) return;
    patch(pickerIndex, {
      title: rc.name,
      costPrice: rc.costPrice,
      sellingPrice: rateCardSelling(rc),
      rateCardId: rc.id,
      supplierId: rc.supplierId ?? undefined,
    });
    toast.success('Rate card applied');
    setPickerIndex(null);
  }

  const pickerType = pickerIndex !== null ? items[pickerIndex]?.type : undefined;

  return (
    <div className="space-y-ds-2">
      <p className="text-xs font-medium text-ds-foreground-muted">Items</p>
      {items.length === 0 && <p className="text-xs text-ds-foreground-subtle">No items on this day yet.</p>}
      {items.map((item, index) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.icon;
        return (
          <div key={item.id ?? `new-${index}`} className="flex gap-ds-3 rounded-lg border border-ds-border bg-ds-surface-sunken p-ds-3">
            <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', meta.tone)} title={meta.label}>
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-ds-2">
              <Input
                value={item.title}
                onChange={(e) => patch(index, { title: e.target.value })}
                placeholder={`${meta.label} name`}
                aria-label={`${meta.label} name`}
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-[4rem_1fr_1fr_auto] items-center gap-ds-2">
                <Input
                  type="number"
                  min={item.paxType ? 0 : 1}
                  value={item.quantity ?? 1}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    // A band line may be 0: nobody of that age travels.
                    patch(index, { quantity: item.paxType ? Math.max(0, Number.isFinite(n) ? n : 0) : Math.max(1, n || 1) });
                  }}
                  aria-label="Quantity"
                  className="h-8 text-xs"
                />
                <CurrencyInput
                  value={item.costPrice || undefined}
                  onChange={(v) => patch(index, { costPrice: v ?? 0 })}
                  currency={currency}
                  placeholder="Cost"
                  aria-label="Cost price"
                  className="h-8 text-xs"
                />
                <CurrencyInput
                  value={item.sellingPrice || undefined}
                  onChange={(v) => patch(index, { sellingPrice: v ?? 0 })}
                  currency={currency}
                  placeholder="Selling"
                  aria-label="Selling price"
                  className="h-8 text-xs"
                />
                <div className="flex gap-ds-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    title="Select from Rate Card"
                    aria-label="Select from Rate Card"
                    onClick={() => setPickerIndex(index)}
                  >
                    <BookOpen className="size-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove item"
                    onClick={() => onChange(items.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-3.5 text-ds-danger" aria-hidden="true" />
                  </Button>
                </div>
              </div>
              {bands && (
                <div className="flex items-center gap-ds-2">
                  <span className="shrink-0 text-xs text-ds-foreground-muted">{t('itineraries.pricedBy.label')}</span>
                  <Select
                    value={item.paxType ?? FIXED}
                    onValueChange={(v) => patch(index, v === FIXED ? { paxType: undefined } : { paxType: v })}
                  >
                    <SelectTrigger className="h-8 w-56 text-xs" aria-label={t('itineraries.pricedBy.aria')} data-testid="item-priced-by">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FIXED}>{t('itineraries.pricedBy.fixed')}</SelectItem>
                      <SelectItem value={PER_PERSON}>{t('itineraries.pricedBy.perPerson')}</SelectItem>
                      {bands.map((b) => (
                        <SelectItem key={b.key} value={b.key}>{`${b.label} (${bandRange(bands, b.key)})`}</SelectItem>
                      ))}
                      {item.paxType && item.paxType !== PER_PERSON && !bands.some((b) => b.key === item.paxType) && (
                        <SelectItem value={item.paxType}>{t('itineraries.pricedBy.unknownBand', { key: item.paxType })}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-ds-2">
        {ADD_ORDER.map((type) => {
          const { label, icon: Icon } = TYPE_META[type];
          return (
            <Button key={type} type="button" variant="outline" size="sm" className="gap-ds-1" onClick={() => add(type)}>
              <Plus className="size-3" aria-hidden="true" />
              <Icon className="size-3" aria-hidden="true" />
              {label}
            </Button>
          );
        })}
      </div>

      <RateCardPicker
        open={pickerIndex !== null}
        onOpenChange={(open) => { if (!open) setPickerIndex(null); }}
        serviceType={pickerType}
        onSelect={applyRateCard}
      />
    </div>
  );
}
