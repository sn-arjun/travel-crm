'use client';

import * as React from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { RelationCombobox } from '@/components/domain/relation-combobox';
import { marketingApi, type MarketingFlyer, type MarketingSegment } from '@/lib/api/marketing';

export interface ShareFlyerDialogProps {
  flyer: MarketingFlyer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareFlyerDialog({ flyer, open, onOpenChange }: ShareFlyerDialogProps) {
  const [segmentId, setSegmentId] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<'email' | 'sms' | 'whatsapp'>('whatsapp');
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setSegmentId(null);
      setChannel('whatsapp');
    }
  }, [open]);

  async function handleShare() {
    if (!flyer) return;
    if (!segmentId) {
      toast.error('Select a segment to share with');
      return;
    }
    setSending(true);
    try {
      await marketingApi.flyers.share({ flyerId: flyer.id, segmentId, channel });
      toast.success('Flyer shared');
      onOpenChange(false);
    } catch {
      toast.error('Failed to share flyer');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share &ldquo;{flyer?.title}&rdquo;</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="share-channel">Channel</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger id="share-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="share-segment">Audience segment</Label>
            <RelationCombobox<MarketingSegment>
              value={segmentId}
              onChange={(id) => setSegmentId(id)}
              fetcher={async (query, page) => {
                const r = await marketingApi.segments.list({ search: query, page, limit: 20 });
                const items = Array.isArray(r.data) ? r.data : r.data.data;
                const total = (r as unknown as { pagination?: { total: number } }).pagination?.total ?? r.data.pagination?.total ?? items.length;
                return { items, total };
              }}
              getOptionId={(s) => s.id}
              getOptionLabel={(s) => s.name}
              getOptionDescription={(s) => `${s.contactCount} contacts`}
              resolveSelected={async () => null}
              placeholder="Select a segment"
              searchPlaceholder="Search segments..."
              required
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void handleShare()} disabled={sending} className="gap-ds-2">
            {sending ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden="true" />}
            Share
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
