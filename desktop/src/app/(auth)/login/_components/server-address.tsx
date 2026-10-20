'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getApiBaseUrl } from '@/lib/api/config';
import { useT } from '@/lib/i18n';

/** "Advanced > Server address": only in the packaged desktop app. Saving relaunches the app. */
export function ServerAddress() {
  const t = useT();
  const [available, setAvailable] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined' && typeof window.electronAPI?.setApiUrl === 'function') {
      setAvailable(true);
      setValue(getApiBaseUrl());
    }
  }, []);

  if (!available) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await window.electronAPI?.setApiUrl(value.trim());
      if (result && !result.ok) {
        toast.error(result.error ?? t('auth.serverAddress.saveFailed'));
        setSaving(false);
      }
      // On success the app relaunches.
    } catch {
      toast.error(t('auth.serverAddress.saveFailed'));
      setSaving(false);
    }
  }

  return (
    <div className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-ds-1 text-ds-foreground-muted hover:text-ds-foreground"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        {t('auth.serverAddress.advanced')}
      </button>
      {open && (
        <form onSubmit={save} className="mt-ds-2 space-y-ds-2">
          <Label htmlFor="server-address">{t('auth.serverAddress.label')}</Label>
          <Input
            id="server-address"
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://api.example.com/api/v1"
            required
          />
          <p className="text-xs text-ds-foreground-muted">
            {t('auth.serverAddress.help')}
          </p>
          <Button type="submit" size="sm" disabled={saving}>
            {t('auth.serverAddress.save')}
          </Button>
        </form>
      )}
    </div>
  );
}
