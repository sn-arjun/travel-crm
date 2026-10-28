'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { CatalogueAddon, CatalogueData } from '@/lib/catalogue';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onGranted: () => void;
}

/** Grant extra users, an AI credit pack or an SMS/WhatsApp/OTP/call-minute pack (POST /admin/tenants/:id/addons). */
export function GrantAddonDialog({ open, onOpenChange, tenantId, onGranted }: Props) {
  const [addons, setAddons] = useState<CatalogueAddon[]>([]);
  const [productKey, setProductKey] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    fetch('/api/catalogue')
      .then(async (res) => {
        const json = (await res.json()) as CatalogueData & { error?: string };
        if (!res.ok) throw new Error(json.error || 'Could not load add-ons');
        const active = json.addons.filter((a) => a.isActive);
        setAddons(active);
        setProductKey((current) => current || active[0]?.key || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load add-ons'));
  }, [open]);

  const grant = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tenants/${tenantId}/addons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productKey, quantity: Number(quantity), note: note.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error || 'Could not grant the add-on');
      return;
    }
    setNote('');
    setQuantity('1');
    onOpenChange(false);
    onGranted();
  };

  const chosen = addons.find((a) => a.key === productKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant add-on</DialogTitle>
          <DialogDescription>
            Extra users last until removed. Packs count for the current month only. A note is required and goes to the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="addon-product">Product</label>
            <select
              id="addon-product"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={productKey}
              onChange={(e) => setProductKey(e.target.value)}
            >
              {addons.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}{a.kind !== 'extra_user' ? ` (${a.units.toLocaleString()} units)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="addon-qty">{chosen?.kind === 'extra_user' ? 'Extra users' : 'Packs'}</label>
            <Input id="addon-qty" type="number" min={1} max={10000} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="addon-note">Note</label>
            <Input id="addon-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid by bank transfer, ref 1234" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={grant} disabled={loading || !productKey || !note.trim() || !(Number(quantity) >= 1)}>
            {loading ? 'Granting...' : 'Grant'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
