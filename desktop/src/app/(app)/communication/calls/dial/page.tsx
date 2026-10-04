'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Phone, PhoneOff, Delete, Clock, ArrowLeft, User, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, PhoneInput, SectionCard, Skeleton } from '@/components/ui';
import { RelationCombobox } from '@/components/domain';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { voipApi, type Call, type CreateOutboundCallRequest } from '@/lib/api/voip';
import { unwrapList } from '@/lib/api/envelope';
import { contactsApi } from '@/lib/api/contacts';
import type { Contact } from '@travelcrm/shared';

const dialPadKeys = [
  { label: '1', sub: '' }, { label: '2', sub: 'ABC' }, { label: '3', sub: 'DEF' },
  { label: '4', sub: 'GHI' }, { label: '5', sub: 'JKL' }, { label: '6', sub: 'MNO' },
  { label: '7', sub: 'PQRS' }, { label: '8', sub: 'TUV' }, { label: '9', sub: 'WXYZ' },
  { label: '*', sub: '' }, { label: '0', sub: '+' }, { label: '#', sub: '' },
];

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function DialPadPageWrapper() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <DialPadPage />
    </Suspense>
  );
}

function DialPadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [number, setNumber] = React.useState(searchParams.get('phone') || '');
  const [countryCode, setCountryCode] = React.useState('+91');
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [isCalling, setIsCalling] = React.useState(false);

  const { data: recentCallsResponse, loading: recentLoading } = useApiQuery(
    () => voipApi.calls.list({ limit: 10 }),
    [],
  );

  const { mutate: makeCall, loading: callLoading } = useApiMutation(
    (data: CreateOutboundCallRequest) => voipApi.calls.createOutbound(data),
  );

  const recentCalls: Call[] = recentCallsResponse?.data ?? [];

  function handleKeyPress(key: string) {
    setNumber((prev) => prev + key);
  }

  function handleBackspace() {
    setNumber((prev) => prev.slice(0, -1));
  }

  async function handleDial() {
    const digits = number.trim().replace(/[^0-9]/g, '');
    if (!digits) {
      toast.error('Please enter a phone number');
      return;
    }
    const toNumber = number.trim().startsWith('+') ? number.trim() : `${countryCode}${digits}`;
    setIsCalling(true);
    const result = await makeCall({ toNumber, contactId: contactId ?? undefined });
    if (result) {
      toast.success(`Calling ${number}...`);
    } else {
      toast.error('Failed to initiate call');
    }
    setIsCalling(false);
  }

  if (gateLoading) return <Skeleton className="h-9 w-32" />;

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-9 text-center">
        <PhoneOff className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">
          {reason === 'cap_exceeded' ? 'Call limit reached for your plan.' : 'VoIP calling is not enabled on your plan.'}
        </p>
        <Button asChild size="sm">
          <a href={upgradeHref}>Upgrade to enable</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-3">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back">
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dial pad</h1>
          <p className="text-sm text-ds-foreground-muted">Make an outbound call</p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-5xl gap-ds-8 sm:grid-cols-2">
        <div className="flex flex-col gap-ds-6">
          <SectionCard title="Contact">
            <RelationCombobox<Contact>
              value={contactId}
              onChange={(id, item) => {
                setContactId(id);
                if (item?.phone) setNumber(item.phone);
              }}
              fetcher={async (q, page) => {
                const r = await contactsApi.list({ search: q, page, limit: 20 });
                const list = unwrapList<Contact>(r);
                const items = list.data;
                return { items: items.filter((c) => c.phone), total: list.pagination.total };
              }}
              getOptionId={(c) => c.id}
              getOptionLabel={(c) => c.name}
              getOptionDescription={(c) => c.phone ?? undefined}
              resolveSelected={async (id) => (await contactsApi.getById(id)).data}
              placeholder="Search contacts…"
              searchPlaceholder="Search by name or phone…"
              emptyText="No contacts found"
            />
          </SectionCard>

          <Card>
            <CardContent className="pt-ds-6 pb-ds-4">
              <div className="mb-ds-4">
                <PhoneInput value={number} onChange={setNumber} countryCode={countryCode} onCountryCodeChange={setCountryCode} placeholder="XXXXX XXXXX" />
              </div>

              <div className="mx-auto grid max-w-[280px] grid-cols-3 gap-ds-3">
                {dialPadKeys.map((key) => (
                  <button
                    key={key.label}
                    onClick={() => handleKeyPress(key.label)}
                    className={cn(
                      'flex h-16 flex-col items-center justify-center rounded-ds-xl',
                      'bg-ds-surface-sunken hover:bg-ds-surface-raised active:bg-ds-surface-raised transition-colors',
                      'text-lg font-semibold',
                    )}
                  >
                    <span>{key.label}</span>
                    {key.sub && <span className="text-[10px] tracking-widest text-ds-foreground-muted">{key.sub}</span>}
                  </button>
                ))}
              </div>

              <div className="mt-ds-6 flex justify-center gap-ds-4">
                {number && (
                  <Button variant="ghost" size="icon" onClick={handleBackspace} aria-label="Backspace">
                    <Delete className="size-5" />
                  </Button>
                )}
                <Button
                  size="lg"
                  className="h-14 w-14 rounded-ds-full bg-ds-success hover:bg-ds-success-hover"
                  onClick={handleDial}
                  disabled={isCalling || callLoading || !number.trim()}
                  aria-label="Call"
                >
                  {isCalling || callLoading ? <Loader2 className="size-6 animate-spin" /> : <Phone className="size-6" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-ds-2 text-base">
              <Clock className="size-4" /> Recent calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <div className="flex flex-col gap-ds-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recentCalls.length === 0 ? (
              <div className="py-ds-8 text-center text-ds-foreground-muted">
                <Phone className="mx-auto mb-ds-2 size-8 opacity-50" />
                <p className="text-sm">No recent calls</p>
              </div>
            ) : (
              <div className="flex flex-col gap-ds-1">
                {recentCalls.map((call) => {
                  const isInbound = call.direction === 'inbound';
                  const displayNumber = isInbound ? call.fromNumber : call.toNumber;
                  return (
                    <div
                      key={call.id}
                      className="group flex cursor-pointer items-center gap-ds-3 rounded-ds-lg p-ds-3 hover:bg-ds-surface-sunken"
                      onClick={() => setNumber(displayNumber)}
                    >
                      <div className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-ds-full',
                        call.status === 'no-answer' ? 'bg-ds-danger-subtle' : isInbound ? 'bg-ds-info-subtle' : 'bg-ds-success-subtle',
                      )}>
                        <Phone className={cn(
                          'size-4',
                          call.status === 'no-answer' ? 'text-ds-danger-on-subtle' : isInbound ? 'text-ds-info-on-subtle' : 'text-ds-success-on-subtle',
                        )} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-sm font-medium">{displayNumber}</p>
                        <p className="text-xs text-ds-foreground-muted">
                          {new Date(call.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {call.durationSeconds > 0 && ` · ${formatDuration(call.durationSeconds)}`}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="View call"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/communication/calls/${call.id}`);
                        }}
                      >
                        <User className="size-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
