'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useT } from '@/lib/i18n';

interface FilterOption {
  id: string;
  label: string;
  value: string;
}

interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  activeFilters?: FilterOption[];
  onRemoveFilter?: (filterId: string) => void;
  onClearFilters?: () => void;
  onOpenFilters?: () => void;
  actions?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  activeFilters = [],
  onRemoveFilter,
  onClearFilters,
  onOpenFilters,
  actions,
  className,
}: FilterBarProps) {
  const t = useT();
  return (
    <div className={cn('space-y-3 animate-fade-in', className)}>
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder ?? t('ui.filterBar.searchPlaceholder')}
            className="h-9 ps-9"
          />
        </div>

        {/* Filter Button */}
        {onOpenFilters && (
          <Button variant="outline" size="sm" onClick={onOpenFilters} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t('ui.filterBar.filters')}
            {activeFilters.length > 0 && (
              <Badge variant="default" className="ms-1">
                {activeFilters.length}
              </Badge>
            )}
          </Button>
        )}

        {/* Actions */}
        {actions && <div className="flex items-center gap-2 ms-auto">{actions}</div>}
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap animate-slide-in-from-top">
          <span className="text-xs text-ds-foreground-muted">{t('ui.filterBar.activeLabel')}</span>
          {activeFilters.map((filter) => (
            <Badge key={filter.id} variant="outline" className="gap-1 pe-1">
              <span className="text-ds-foreground-muted">{filter.label}:</span>
              {filter.value}
              {onRemoveFilter && (
                <button
                  onClick={() => onRemoveFilter(filter.id)}
                  className="ms-0.5 rounded-full p-0.5 hover:bg-ds-surface-sunken transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {onClearFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-6 text-xs text-ds-foreground-muted">
              {t('ui.filterBar.clearAll')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
