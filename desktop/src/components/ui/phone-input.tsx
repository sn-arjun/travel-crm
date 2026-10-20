'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { joinPhone, phonePlaceholder, splitPhone } from '@/lib/phone';
import { COUNTRIES, countryByDial, countryByIso, flagOf } from '@/lib/countries';
import { useLocale } from '@/lib/locale';
import { useT } from '@/lib/i18n';
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

/** Every country with its own calling code (generated table); the picker searches name, ISO code and +code. */
const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({
  code: `+${c.dial}`,
  iso: c.iso,
  flag: flagOf(c.iso),
  label: c.name,
}));

export interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  countryCode?: string;
  /** Receives the picked calling code ("+44") and the picked country (ISO alpha-2, tells +1 US from CA). */
  onCountryCodeChange?: (code: string, iso: string) => void;
  /** ISO code of the picked country, so countries sharing a calling code show the right flag. */
  countryIso?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

function getSelectedCountry(code: string, iso?: string) {
  const byIso = iso ? COUNTRY_OPTIONS.find((c) => c.iso === iso && c.code === code) : undefined;
  return byIso ?? COUNTRY_OPTIONS.find((c) => c.code === code) ?? COUNTRY_OPTIONS.find((c) => c.iso === 'IN')!;
}

export function PhoneInput({
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  countryIso,
  placeholder,
  className,
  disabled,
}: PhoneInputProps) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  // The agency's country decides the code until the user picks another one
  const { phoneDefaultCountry } = useLocale();
  const effectiveCode = countryCode ?? `+${(countryByIso(phoneDefaultCountry) ?? countryByIso('IN')!).dial}`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9\s-]/g, '');
    onChange(raw);
  }

  const selected = getSelectedCountry(effectiveCode, countryIso);
  const examplePlaceholder = placeholder ?? phonePlaceholder(countryByDial(effectiveCode));

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
            <CommandInput placeholder={t('ui.phone.searchCountry')} />
            <CommandList>
              <CommandEmpty>{t('ui.phone.noCountry')}</CommandEmpty>
              <CommandGroup>
                {COUNTRY_OPTIONS.map((c) => (
                  <CommandItem
                    key={c.iso}
                    value={`${c.label} ${c.iso} ${c.code}`}
                    onSelect={() => {
                      onCountryCodeChange?.(c.code, c.iso);
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
        placeholder={examplePlaceholder}
        disabled={disabled}
        className="h-9 flex-1"
        type="tel"
      />
    </div>
  );
}

export interface E164PhoneInputProps {
  /** Stored value: E.164 ("+919820144562"), a legacy digit-only number, or ''. */
  value: string;
  /** Receives E.164, or '' when no digits are entered. */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * `PhoneInput` for forms that keep one string. It splits the stored value for the picker
 * (digit-only numbers are read as numbers of the agency's country) and always writes E.164 back.
 */
export function E164PhoneInput({ value, onChange, placeholder, className, disabled }: E164PhoneInputProps) {
  const parts = splitPhone(value);
  // The picked code is remembered even while no digits are typed yet
  const [pickedCode, setPickedCode] = React.useState<string | null>(null);
  const [pickedIso, setPickedIso] = React.useState<string | undefined>(undefined);
  const countryCode = parts.national ? parts.countryCode : (pickedCode ?? parts.countryCode);
  const iso = countryCode === pickedCode ? pickedIso : undefined;

  return (
    <PhoneInput
      value={parts.national}
      countryCode={countryCode}
      countryIso={iso}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      onChange={(national) => onChange(joinPhone(countryCode, national))}
      onCountryCodeChange={(code, pickedCountry) => {
        setPickedCode(code);
        setPickedIso(pickedCountry);
        if (parts.national) onChange(joinPhone(code, parts.national));
      }}
    />
  );
}
