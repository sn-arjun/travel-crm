'use client';

import { useState } from 'react';
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
import { Copy, ExternalLink } from 'lucide-react';

interface ImpersonationResult {
  accessToken: string;
  expiresAt: string;
  sessionId: string;
  user: { id: string; email: string; role: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
}

const DESKTOP_URL = process.env.NEXT_PUBLIC_DESKTOP_URL || 'http://localhost:3000';

/**
 * Starts a time-boxed support session (POST /admin/tenants/:id/impersonate). A reason is required and is
 * written to the audit log. The token lasts 30 minutes, has no refresh token, and the desktop app shows a
 * banner for the whole session.
 */
export function ImpersonationDialog({ open, onOpenChange, tenantId, tenantName }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImpersonationResult | null>(null);
  const [copied, setCopied] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setReason('');
      setError('');
      setResult(null);
      setCopied(false);
    }
    onOpenChange(next);
  };

  const start = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/tenants/${tenantId}/impersonate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const json = (await res.json()) as ImpersonationResult & { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(json.error || 'Could not start the support session');
      return;
    }
    setResult(json);
  };

  const desktopLink = result
    ? `${DESKTOP_URL}/support-session#token=${encodeURIComponent(result.accessToken)}&tenant=${encodeURIComponent(tenantName)}`
    : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result?.accessToken ?? '');
      setCopied(true);
    } catch {
      setError('Copy failed');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Support session for {tenantName}</DialogTitle>
          <DialogDescription>
            Signs you in as the agency&apos;s admin for 30 minutes. Every request is logged against you in the agency&apos;s activity log.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="imp-reason">Reason (required, at least 5 characters)</label>
            <Input id="imp-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer cannot find their invoices" />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              Session started as <span className="font-medium">{result.user.email}</span>. It ends at{' '}
              <span className="font-medium">{new Date(result.expiresAt).toLocaleTimeString()}</span>.
            </p>
            <a
              href={desktopLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-primary-foreground"
            >
              <ExternalLink className="h-4 w-4" /> Open in the agency app
            </a>
            <div>
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="mr-2 h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy access token'}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">Treat the token like a password. It is shown only now.</p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button onClick={start} disabled={loading || reason.trim().length < 5}>
              {loading ? 'Starting...' : 'Start session'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
