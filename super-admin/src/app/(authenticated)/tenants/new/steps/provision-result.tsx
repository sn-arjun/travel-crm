'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, Copy, Loader2, RotateCcw } from 'lucide-react';

export interface ProvisionOutcome {
  tenantId: string;
  slug: string;
  provisioningStatus: string;
  adminEmail: string;
  temporaryPassword: string;
  welcomeEmailSent: boolean;
}

interface ProvisioningState {
  tenantStatus: string;
  provisioningStatus: string;
  provisioningError: string | null;
  deployNeeded: boolean;
}

const IN_PROGRESS = new Set(['creating_db', 'migrating', 'seeding', 'binding']);

/** Shown after POST /admin/tenants: the temporary password (once) and the provisioning status. */
export function ProvisionResult({ outcome }: { outcome: ProvisionOutcome }) {
  const [state, setState] = useState<ProvisioningState>({
    tenantStatus: '',
    provisioningStatus: outcome.provisioningStatus,
    provisioningError: null,
    deployNeeded: outcome.provisioningStatus === 'pending_deploy',
  });
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const res = await fetch(`/api/tenants/${outcome.tenantId}/provisioning`);
    if (res.ok) setState((await res.json()) as ProvisioningState);
  };

  // Poll while the backend is still working on it.
  useEffect(() => {
    if (!IN_PROGRESS.has(state.provisioningStatus)) return;
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.provisioningStatus, outcome.tenantId]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(outcome.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage('Copy failed. Select the password and copy it by hand.');
    }
  };

  const retry = async () => {
    setRetrying(true);
    setMessage('');
    const res = await fetch(`/api/tenants/${outcome.tenantId}/retry`, { method: 'POST' });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) setMessage(json.error || 'Retry failed');
    await refresh();
    setRetrying(false);
  };

  const status = state.provisioningStatus;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {status === 'active' ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : IN_PROGRESS.has(status) ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5 text-yellow-600" />}
          Agency created
          <Badge variant="outline">{status.replace(/_/g, ' ')}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.deployNeeded && (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900 dark:bg-yellow-950/30 dark:text-yellow-200">
            Deploy needed: the agency database is created but the backend must be deployed with the new database binding before the agency can sign in.
          </div>
        )}
        {status === 'failed' && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive space-y-2">
            <p>Provisioning failed{state.provisioningError ? `: ${state.provisioningError}` : '.'}</p>
            <Button size="sm" variant="outline" onClick={retry} disabled={retrying}>
              <RotateCcw className="mr-2 h-3.5 w-3.5" /> {retrying ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        )}
        {message && <p className="text-sm text-destructive">{message}</p>}

        <div className="rounded-lg border p-4 space-y-2">
          <p className="text-sm text-muted-foreground">Agency admin sign-in</p>
          <p className="text-sm">Email: <span className="font-mono font-medium">{outcome.adminEmail}</span></p>
          <div className="flex items-center gap-2">
            <span className="text-sm">Temporary password:</span>
            <code className="rounded bg-muted px-2 py-1 text-sm font-mono" data-testid="temporary-password">{outcome.temporaryPassword}</code>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy className="mr-2 h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This password is shown only now and is not stored. {outcome.welcomeEmailSent ? 'It was also emailed to the owner.' : 'No email was sent, so pass it on yourself.'}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href={`/tenants/${outcome.tenantId}`}><Button>Open agency</Button></Link>
          <Link href="/tenants"><Button variant="outline">Back to tenants</Button></Link>
        </div>
      </CardContent>
    </Card>
  );
}
