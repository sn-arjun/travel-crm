'use client';

import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

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
  searchPlaceholder = 'Search...',
  activeFilters = [],
  onRemoveFilter,
  onClearFilters,
  onOpenFilters,
  actions,
  className,
}: FilterBarProps) {
  return (
    <div className={cn('space-y-3 animate-fade-in', className)}>
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 pl-9"
          />
        </div>

        {/* Filter Button */}
        {onOpenFilters && (
          <Button variant="outline" size="sm" onClick={onOpenFilters} className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilters.length > 0 && (
              <Badge variant="default" className="ml-1">
                {activeFilters.length}
              </Badge>
            )}
          </Button>
        )}

        {/* Actions */}
        {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap animate-slide-in-from-top">
          <span className="text-xs text-[var(--color-text-muted)]">Filters:</span>
          {activeFilters.map((filter: any) => (
            <Badge key={filter.id} variant="outline" className="gap-1 pr-1">
              <span className="text-[var(--color-text-muted)]">{filter.label}:</span>
              {filter.value}
              {onRemoveFilter && (
                <button
                  onClick={() => onRemoveFilter(filter.id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--color-bg-muted)] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
          {onClearFilters && (
            <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-6 text-xs text-[var(--color-text-muted)]">
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
