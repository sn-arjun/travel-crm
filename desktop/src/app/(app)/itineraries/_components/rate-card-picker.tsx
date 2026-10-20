'use client';

import * as React from 'react';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { unwrapList } from '@/lib/api/envelope';
import { rateCardsApi, type RateCard, type RateCardServiceType } from '@/lib/api/rate-cards';
import { formatCurrency } from '@/lib/utils';

const TYPE_LABEL: Record<RateCardServiceType, string> = {
  hotel: 'Hotel',
  transport: 'Transport',
  activity: 'Activity',
  meal: 'Meal',
  flight: 'Flight',
};

/** Selling price of a rate card, falling back to cost when none is set. */
export function rateCardSelling(rc: RateCard): number {
  return rc.sellingPrice && rc.sellingPrice > 0 ? rc.sellingPrice : rc.costPrice;
}

interface RateCardPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restrict the list to one service type (the activity being priced). */
  serviceType?: RateCardServiceType;
  onSelect: (rateCard: RateCard) => void;
}

/** Searchable rate-card list: service name, category, supplier, cost and selling price. */
export function RateCardPicker({ open, onOpenChange, serviceType, onSelect }: RateCardPickerProps) {
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 250);
  const [rows, setRows] = React.useState<RateCard[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    rateCardsApi
      .list({ search: debounced.trim() || undefined, serviceType, isActive: true, limit: 50 })
      .then((res) => {
        if (!cancelled) setRows(unwrapList<RateCard>(res).data);
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debounced, serviceType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[75vh] flex flex-col">
        <DialogTitle className="text-base">Select from Rate Cards</DialogTitle>
        <DialogDescription className="text-xs text-ds-foreground-muted">
          Pick a negotiated supplier rate to fill in the name, cost and selling price.
        </DialogDescription>
        <div className="relative">
          <Search
            className="absolute left-ds-3 top-1/2 -translate-y-1/2 size-4 text-ds-foreground-subtle"
            aria-hidden="true"
          />
          <Input
            aria-label="Search rate cards"
            placeholder="Search rate cards..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" data-testid="rate-card-results">
          {loading && (
            <div className="flex items-center justify-center py-ds-8">
              <Loader2 className="size-6 animate-spin text-ds-foreground-subtle" aria-hidden="true" />
            </div>
          )}
          {!loading && failed && (
            <p className="py-ds-8 text-center text-sm text-ds-danger">Could not load rate cards. Try again.</p>
          )}
          {!loading && !failed && rows.length === 0 && (
            <p className="py-ds-8 text-center text-sm text-ds-foreground-muted">
              No rate cards found. Try a different search.
            </p>
          )}
          {!loading && rows.length > 0 && (
            <ul className="divide-y divide-ds-border">
              {rows.map((rc) => (
                <li key={rc.id}>
                  <div className="flex items-center gap-ds-3 py-ds-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ds-foreground">{rc.name}</p>
                      <p className="truncate text-xs text-ds-foreground-muted">
                        {[
                          TYPE_LABEL[rc.serviceType] ?? rc.serviceType,
                          rc.supplierName || null,
                          rc.destination || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="text-ds-foreground-muted">
                        Cost <span className="font-mono text-ds-foreground">{formatCurrency(rc.costPrice, rc.currency || undefined)}</span>
                      </p>
                      <p className="text-ds-foreground-muted">
                        Sell <span className="font-mono text-ds-foreground">{formatCurrency(rateCardSelling(rc), rc.currency || undefined)}</span>
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => onSelect(rc)}>
                      Select
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
