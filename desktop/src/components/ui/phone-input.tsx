'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';

const COUNTRY_CODES = [
  { code: '+91', country: 'IN', flag: '\u{1F1EE}\u{1F1F3}', label: 'India' },
  { code: '+1', country: 'US', flag: '\u{1F1FA}\u{1F1F8}', label: 'USA' },
  { code: '+44', country: 'GB', flag: '\u{1F1EC}\u{1F1E7}', label: 'UK' },
  { code: '+971', country: 'AE', flag: '\u{1F1E6}\u{1F1EA}', label: 'UAE' },
  { code: '+966', country: 'SA', flag: '\u{1F1F8}\u{1F1E6}', label: 'Saudi' },
  { code: '+65', country: 'SG', flag: '\u{1F1F8}\u{1F1EC}', label: 'Singapore' },
  { code: '+66', country: 'TH', flag: '\u{1F1F9}\u{1F1ED}', label: 'Thailand' },
  { code: '+60', country: 'MY', flag: '\u{1F1F2}\u{1F1FE}', label: 'Malaysia' },
  { code: '+61', country: 'AU', flag: '\u{1F1E6}\u{1F1FA}', label: 'Australia' },
  { code: '+49', country: 'DE', flag: '\u{1F1E9}\u{1F1EA}', label: 'Germany' },
  { code: '+33', country: 'FR', flag: '\u{1F1EB}\u{1F1F7}', label: 'France' },
  { code: '+86', country: 'CN', flag: '\u{1F1E8}\u{1F1F3}', label: 'China' },
  { code: '+81', country: 'JP', flag: '\u{1F1EF}\u{1F1F5}', label: 'Japan' },
  { code: '+82', country: 'KR', flag: '\u{1F1F0}\u{1F1F7}', label: 'S. Korea' },
  { code: '+7', country: 'RU', flag: '\u{1F1F7}\u{1F1FA}', label: 'Russia' },
  { code: '+55', country: 'BR', flag: '\u{1F1E7}\u{1F1F7}', label: 'Brazil' },
  { code: '+27', country: 'ZA', flag: '\u{1F1FF}\u{1F1E6}', label: 'S. Africa' },
  { code: '+234', country: 'NG', flag: '\u{1F1F3}\u{1F1EC}', label: 'Nigeria' },
  { code: '+254', country: 'KE', flag: '\u{1F1F0}\u{1F1EA}', label: 'Kenya' },
  { code: '+62', country: 'ID', flag: '\u{1F1EE}\u{1F1E9}', label: 'Indonesia' },
  { code: '+63', country: 'PH', flag: '\u{1F1F5}\u{1F1ED}', label: 'Philippines' },
  { code: '+84', country: 'VN', flag: '\u{1F1FB}\u{1F1F3}', label: 'Vietnam' },
  { code: '+34', country: 'ES', flag: '\u{1F1EA}\u{1F1F8}', label: 'Spain' },
  { code: '+39', country: 'IT', flag: '\u{1F1EE}\u{1F1F9}', label: 'Italy' },
  { code: '+90', country: 'TR', flag: '\u{1F1F9}\u{1F1F7}', label: 'Turkey' },
  { code: '+20', country: 'EG', flag: '\u{1F1EA}\u{1F1EC}', label: 'Egypt' },
  { code: '+94', country: 'LK', flag: '\u{1F1F1}\u{1F1F0}', label: 'Sri Lanka' },
  { code: '+977', country: 'NP', flag: '\u{1F1F3}\u{1F1F5}', label: 'Nepal' },
  { code: '+880', country: 'BD', flag: '\u{1F1E7}\u{1F1E9}', label: 'Bangladesh' },
  { code: '+92', country: 'PK', flag: '\u{1F1F5}\u{1F1F0}', label: 'Pakistan' },
];

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
  onCountryCodeChange?: (code: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function getSelectedCountry(code: string) {
  return COUNTRY_CODES.find((c) => c.code === code) ?? COUNTRY_CODES[0]!;
}

export function PhoneInput({
  value,
  onChange,
  countryCode = '+91',
  onCountryCodeChange,
  placeholder = 'XXXXX XXXXX',
  className,
  disabled,
}: PhoneInputProps) {
  const [open, setOpen] = React.useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9\s-]/g, '');
    onChange(raw);
  }

  const selected = getSelectedCountry(countryCode);

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 h-9 rounded-md border border-input bg-transparent px-2.5 text-sm whitespace-nowrap shadow-xs transition-colors',
              'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <span className="text-base leading-none">{selected.flag}</span>
            <span className="font-medium">{selected.code}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-65 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {COUNTRY_CODES.map((c) => (
                  <CommandItem
                    key={c.code}
                    value={`${c.label} ${c.country} ${c.code}`}
                    onSelect={() => {
                      onCountryCodeChange?.(c.code);
                      setOpen(false);
                    }}
                  >
                    <span className="text-base leading-none mr-2">{c.flag}</span>
                    <span className="flex-1">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Input
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="h-9 flex-1"
        type="tel"
      />
    </div>
  );
}
