'use client';

import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import * as React from 'react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

/**
 * A page of relation options, as returned by the caller's fetcher.
 * Deliberately narrower than `PaginatedResponse<T>` so callers can adapt any
 * list endpoint without reshaping it.
 */
export interface RelationPage<T> {
  items: T[];
  /** Total matching records; used to decide whether more pages exist. */
  total: number;
}

export interface RelationComboboxProps<T> {
  /** Current value — the related entity's id, or null when unset. */
  value: string | null;
  onChange: (id: string | null, item: T | null) => void;

  /** Fetches one page of options. Called debounced as the user types. */
  fetcher: (query: string, page: number) => Promise<RelationPage<T>>;

  getOptionId: (item: T) => string;
  getOptionLabel: (item: T) => string;
  /** Secondary line under the label — e.g. an email or reference number. */
  getOptionDescription?: (item: T) => string | undefined;

  /**
   * Resolves the label for `value` when the selected item is not in the
   * loaded page (e.g. on an edit form after a fresh mount).
   */
  resolveSelected?: (id: string) => Promise<T | null>;

  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  /** Renders a red asterisk on the trigger's accessible name. */
  required?: boolean;
  /** Inline validation message; also sets aria-invalid. */
  error?: string;
  /** Accessible name for the trigger. */
  'aria-label'?: string;
  'aria-labelledby'?: string;

  /** Renders an inline "create new" row at the bottom of the list. */
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;

  pageSize?: number;
  className?: string;
}

/**
 * Searchable, debounced, paginated, async-loading picker for foreign-key
 * fields. Every relation field in the app uses this — never a text input.
 */
export function RelationCombobox<T>({
  value,
  onChange,
  fetcher,
  getOptionId,
  getOptionLabel,
  getOptionDescription,
  resolveSelected,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  disabled,
  required,
  error,
  onCreateNew,
  createNewLabel = 'Create new',
  pageSize: _pageSize = 20,
  className,
  ...aria
}: RelationComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const debouncedQuery = useDebouncedValue(query, 250);

  const [items, setItems] = React.useState<T[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<T | null>(null);

  // Guards against out-of-order responses overwriting newer results.
  const requestId = React.useRef(0);
  // Callers usually pass an inline fetcher; keep it in a ref so `load` is
  // stable and parent re-renders don't re-fire the effect (cancelling results).
  const fetcherRef = React.useRef(fetcher);
  React.useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const errorId = React.useId();

  const load = React.useCallback(
    async (q: string, pageNum: number, append: boolean) => {
      const id = ++requestId.current;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetcherRef.current(q, pageNum);
        if (id !== requestId.current) return;
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
        setPage(pageNum);
      } catch {
        if (id !== requestId.current) return;
        // Degrade to an empty, non-crashing list.
        setLoadError('Could not load options.');
        if (!append) setItems([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [],
  );

  // Load the first page when opened, and whenever the debounced query changes.
  React.useEffect(() => {
    if (!open) return;
    void load(debouncedQuery, 1, false);
  }, [open, debouncedQuery, load]);

  // Resolve the label for a preset value that isn't in the loaded page. The
  // selected item is cached in state, so a later search that replaces `items`
  // never drops the label of the current selection.
  React.useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected && getOptionId(selected) === value) return;
    const inList = items.find((i) => getOptionId(i) === value);
    if (inList) {
      setSelected(inList);
      return;
    }
    if (!resolveSelected) return;
    let cancelled = false;
    void resolveSelected(value)
      .then((item) => {
        if (!cancelled && item) setSelected(item);
      })
      .catch(() => {
        // Leave the trigger showing the placeholder rather than crashing.
      });
    return () => {
      cancelled = true;
    };
  }, [value, items, selected, getOptionId, resolveSelected]);

  const hasMore = items.length < total;

  const handleSelect = (item: T) => {
    const id = getOptionId(item);
    if (id === value) {
      onChange(null, null);
      setSelected(null);
    } else {
      onChange(id, item);
      setSelected(item);
    }
    setOpen(false);
  };

  const triggerLabel = selected ? getOptionLabel(selected) : placeholder;

  return (
    <div className={cn('w-full', className)}>
      <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-required={required}
            aria-invalid={Boolean(error)}
            aria-errormessage={error ? errorId : undefined}
            disabled={disabled}
            {...aria}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-ds-2 rounded-ds-md border px-ds-3 py-ds-2 text-sm',
              'bg-ds-surface text-ds-foreground transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error ? 'border-ds-danger' : 'border-ds-border hover:border-ds-border-strong',
            )}
          >
            <span className={cn('truncate', !selected && 'text-ds-foreground-subtle')}>
              {triggerLabel}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
            />
            <CommandList>
              {loading && items.length === 0 ? (
                <div className="flex items-center justify-center gap-ds-2 py-ds-6 text-sm text-ds-foreground-muted">
                  <Spinner className="size-4" />
                  Loading…
                </div>
              ) : (
                <>
                  {items.length === 0 && (
                    <CommandEmpty>{loadError ?? emptyText}</CommandEmpty>
                  )}
                  <CommandGroup>
                    {items.map((item) => {
                      const id = getOptionId(item);
                      const description = getOptionDescription?.(item);
                      return (
                        <CommandItem key={id} value={id} onSelect={() => handleSelect(item)}>
                          <Check
                            className={cn(
                              'size-4 shrink-0',
                              value === id ? 'opacity-100' : 'opacity-0',
                            )}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{getOptionLabel(item)}</span>
                            {description && (
                              <span className="block truncate text-xs text-ds-foreground-muted">
                                {description}
                              </span>
                            )}
                          </span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>

                  {hasMore && (
                    <div className="border-t border-ds-border p-ds-1">
                      <button
                        type="button"
                        onClick={() => void load(debouncedQuery, page + 1, true)}
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-ds-2 rounded-ds-sm px-ds-2 py-ds-2 text-xs text-ds-foreground-muted transition-colors hover:bg-ds-surface-sunken focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none disabled:opacity-50"
                      >
                        {loading && <Spinner className="size-3" />}
                        Load more
                      </button>
                    </div>
                  )}

                  {onCreateNew && (
                    <div className="border-t border-ds-border p-ds-1">
                      <button
                        type="button"
                        onClick={() => {
                          onCreateNew(query);
                          setOpen(false);
                        }}
                        className="flex w-full items-center gap-ds-2 rounded-ds-sm px-ds-2 py-ds-2 text-sm text-ds-primary transition-colors hover:bg-ds-primary-subtle focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none"
                      >
                        <Plus className="size-4" aria-hidden="true" />
                        {createNewLabel}
                        {query && <span className="truncate opacity-70">“{query}”</span>}
                      </button>
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {error && (
        <p id={errorId} role="alert" className="mt-ds-1 text-xs text-ds-danger">
          {error}
        </p>
      )}
    </div>
  );
}
