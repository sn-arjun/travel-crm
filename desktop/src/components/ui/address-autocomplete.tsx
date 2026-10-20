'use client';

import * as React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export interface AddressParts {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  lat?: number;
  lng?: number;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelect?: (parts: AddressParts) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Minimal shape of the parts of the Google Maps JS API this component uses. */
interface GeoComponent {
  types?: string[];
  long_name: string;
}

interface GooglePlace {
  address_components?: GeoComponent[];
  formatted_address?: string;
  geometry?: { location?: { lat(): number; lng(): number } };
}

interface GoogleAutocomplete {
  addListener(event: string, handler: () => void): void;
  getPlace(): GooglePlace;
}

interface GoogleGeocoder {
  geocode(
    request: { location: { lat: number; lng: number } },
    callback: (results: { address_components?: GeoComponent[] }[] | null, status: string) => void,
  ): void;
}

interface GoogleMapsApi {
  places?: {
    Autocomplete: new (input: HTMLInputElement, options: { fields: string[] }) => GoogleAutocomplete;
  };
  Geocoder?: new () => GoogleGeocoder;
}

function getGoogleMaps(): GoogleMapsApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { google?: { maps?: GoogleMapsApi } }).google?.maps;
}

function extractParts(addressComponents: GeoComponent[]): { parts: AddressParts; streetNumber: string; route: string } {
  const parts: AddressParts = {
    address: '',
    city: '',
    state: '',
    country: '',
    postalCode: '',
  };
  let streetNumber = '';
  let route = '';

  for (const component of addressComponents) {
    const types: string[] = component.types || [];

    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    }
    if (types.includes('route')) {
      route = component.long_name;
    }
    if ((types.includes('sublocality_level_1') || types.includes('sublocality')) && !parts.address) {
      parts.address = component.long_name;
    }
    if (types.includes('locality')) {
      parts.city = component.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      parts.state = component.long_name;
    }
    if (types.includes('country')) {
      parts.country = component.long_name;
    }
    if (types.includes('postal_code')) {
      parts.postalCode = component.long_name;
    }
    if (types.includes('postal_code_prefix') && !parts.postalCode) {
      parts.postalCode = component.long_name;
    }
  }

  parts.address = [streetNumber, route].filter(Boolean).join(' ') || parts.address;
  return { parts, streetNumber, route };
}

/**
 * Google Places Autocomplete wrapper for address input.
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY env var.
 * Falls back to a plain text input if the API key is missing or script fails to load.
 */
export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder: placeholderProp,
  className,
  disabled,
}: AddressAutocompleteProps) {
  const t = useT();
  const placeholder = placeholderProp ?? t('ui.address.placeholder');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const autocompleteRef = React.useRef<GoogleAutocomplete | null>(null);
  const onChangeRef = React.useRef(onChange);
  const onAddressSelectRef = React.useRef(onAddressSelect);
  const skipNextOnChange = React.useRef(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);

  // Keep refs in sync to avoid re-init on every render
  React.useEffect(() => {
    onChangeRef.current = onChange;
    onAddressSelectRef.current = onAddressSelect;
  }, [onChange, onAddressSelect]);

  const apiKey = typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '')
    : '';

  // Inject .pac-container z-index once
  React.useEffect(() => {
    if (document.getElementById('pac-style')) return;
    const style = document.createElement('style');
    style.id = 'pac-style';
    style.textContent = '.pac-container { z-index: 9999 !important; }';
    document.head.appendChild(style);
  }, []);

  // Load Google Maps script
  React.useEffect(() => {
    if (!apiKey) return;
    if (getGoogleMaps()?.places) {
      setIsLoaded(true);
      return;
    }

    if (document.querySelector('script[src*="maps.googleapis.com/maps/api"]')) {
      const checkLoaded = setInterval(() => {
        if (getGoogleMaps()?.places) {
          setIsLoaded(true);
          clearInterval(checkLoaded);
        }
      }, 200);
      return () => clearInterval(checkLoaded);
    }

    setIsLoading(true);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setIsLoaded(true);
      setIsLoading(false);
    };
    script.onerror = () => {
      setIsLoading(false);
    };
    document.head.appendChild(script);
  }, [apiKey]);

  // Initialize autocomplete — only once
  React.useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const gm = getGoogleMaps();
    if (!gm?.places) return;

    const autocomplete = new gm.places.Autocomplete(inputRef.current, {
      fields: ['address_components', 'formatted_address', 'geometry'],
    });

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (!place.address_components) return;

      const { parts } = extractParts(place.address_components);

      if (place.geometry?.location) {
        parts.lat = place.geometry.location.lat();
        parts.lng = place.geometry.location.lng();
      }

      const formattedAddress = place.formatted_address || parts.address;

      // Google already set the input DOM value; tell React about it
      // and skip the next onChange to avoid a double-call
      skipNextOnChange.current = true;
      if (inputRef.current) {
        inputRef.current.value = formattedAddress;
      }

      // If postal code is missing, try reverse geocoding with lat/lng
      if (!parts.postalCode && parts.lat && parts.lng && gm.Geocoder) {
        const geocoder = new gm.Geocoder();
        geocoder.geocode(
          { location: { lat: parts.lat, lng: parts.lng } },
          (results, status) => {
            const found = results?.[0]?.address_components;
            if (status === 'OK' && found) {
              for (const component of found) {
                const types: string[] = component.types || [];
                if (types.includes('postal_code')) {
                  parts.postalCode = component.long_name;
                  break;
                }
                if (types.includes('postal_code_prefix') && !parts.postalCode) {
                  parts.postalCode = component.long_name;
                }
              }
            }
            onChangeRef.current(formattedAddress);
            onAddressSelectRef.current?.(parts);
          },
        );
      } else {
        onChangeRef.current(formattedAddress);
        onAddressSelectRef.current?.(parts);
      }
    });

    autocompleteRef.current = autocomplete;
  }, [isLoaded]);

  // Sync external value changes into the uncontrolled input (e.g. form reset)
  React.useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <div className={cn('relative', className)}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
      <input
        ref={inputRef}
        defaultValue={value}
        onChange={(e) => {
          if (skipNextOnChange.current) {
            skipNextOnChange.current = false;
            return;
          }
          onChangeRef.current(e.target.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
          'placeholder:text-muted-foreground',
          'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'pl-9',
        )}
      />
      {isLoading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
