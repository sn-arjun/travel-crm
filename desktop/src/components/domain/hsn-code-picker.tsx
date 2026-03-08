'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { hsnCodesApi, type HsnCode } from '@/lib/api/hsn-codes';

interface HsnCodePickerProps {
  value?: string;
  onChange: (code: string, description?: string) => void;
  placeholder?: string;
  className?: string;
}

export function HsnCodePicker({ value, onChange, placeholder = 'Select HSN/SAC code...', className }: HsnCodePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [codes, setCodes] = React.useState<HsnCode[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const fetchCodes = async () => {
      setLoading(true);
      try {
        const res = await hsnCodesApi.list({ search: search || undefined });
        setCodes(res?.data ?? []);
      } catch {
        setCodes([]);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(fetchCodes, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const selectedCode = codes.find((c) => c.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          {value ? `${value} - ${selectedCode?.description ?? ''}` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search HSN/SAC codes..." value={search} onValueChange={setSearch} />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}
            <CommandEmpty>No codes found.</CommandEmpty>
            <CommandGroup>
              {codes.map((code) => (
                <CommandItem
                  key={code.code}
                  value={code.code}
                  onSelect={() => {
                    onChange(code.code, code.description);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === code.code ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <span className="font-mono text-xs">{code.code}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{code.description}</span>
                    {code.category && <span className="ml-2 text-xs text-muted-foreground/60">({code.category})</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
