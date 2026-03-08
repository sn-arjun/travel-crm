'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Phone, PhoneOff, Delete, Search, Clock,
  ArrowLeft, User, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { voipApi, type Call, type CreateOutboundCallRequest } from '@/lib/api/voip';
import { contactsApi } from '@/lib/api/contacts';

const dialPadKeys = [
  { label: '1', sub: '' },
  { label: '2', sub: 'ABC' },
  { label: '3', sub: 'DEF' },
  { label: '4', sub: 'GHI' },
  { label: '5', sub: 'JKL' },
  { label: '6', sub: 'MNO' },
  { label: '7', sub: 'PQRS' },
  { label: '8', sub: 'TUV' },
  { label: '9', sub: 'WXYZ' },
  { label: '*', sub: '' },
  { label: '0', sub: '+' },
  { label: '#', sub: '' },
];

function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export default function DialPadPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <DialPadPage />
    </Suspense>
  );
}

function DialPadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [number, setNumber] = React.useState(searchParams.get('phone') || '');
  const [contactSearch, setContactSearch] = React.useState('');
  const [isCalling, setIsCalling] = React.useState(false);

  const { data: contactsResponse } = useApiQuery<any>(
    () => contactSearch.length >= 2
      ? contactsApi.list({ search: contactSearch, limit: 10 })
      : Promise.resolve({ data: { data: [] } }),
    [contactSearch],
  );

  const matchedContacts = React.useMemo(() => {
    const data = contactsResponse?.data;
    const list = Array.isArray(data) ? data : (data?.data ?? []);
    return list.filter((c: any) => c.phone);
  }, [contactsResponse]);

  const { data: recentCallsResponse, loading: recentLoading } = useApiQuery<any>(
    () => voipApi.calls.list({ limit: 10 }),
    [],
  );

  const { mutate: makeCall, loading: callLoading } = useApiMutation(
    (data: CreateOutboundCallRequest) => voipApi.calls.createOutbound(data),
  );

  const recentCalls: Call[] = React.useMemo(() => {
    const data = recentCallsResponse?.data;
    return Array.isArray(data) ? data : (data?.data ?? []);
  }, [recentCallsResponse]);

  function handleKeyPress(key: string) {
    setNumber((prev) => prev + key);
  }

  function handleBackspace() {
    setNumber((prev) => prev.slice(0, -1));
  }

  async function handleDial() {
    if (!number.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    setIsCalling(true);
    const result = await makeCall({ to: number.trim() });
    if (result) {
      toast.success(`Calling ${number}...`);
    } else {
      toast.error('Failed to initiate call');
    }
    setIsCalling(false);
  }

  function handleRecentCallDial(phoneNumber: string) {
    setNumber(phoneNumber);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Dial Pad
            </h1>
            <p className="text-sm text-muted-foreground">Make an outbound call</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 gap-8">
          {/* Left: Dial Pad */}
          <div className="space-y-6">
            {/* Contact Search */}
            <Card>
              <CardContent className="pt-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {matchedContacts.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-auto">
                    {matchedContacts.map((contact: any) => (
                      <div
                        key={contact.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => { setNumber(contact.phone); setContactSearch(''); }}
                      >
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{contact.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{contact.phone}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Number Display */}
            <Card>
              <CardContent className="pt-6 pb-4">
                <div className="text-center mb-6">
                  <div className="flex items-center justify-center gap-2 min-h-[48px]">
                    <p className="text-3xl font-bold font-mono tracking-wider">
                      {number || <span className="text-muted-foreground">Enter number</span>}
                    </p>
                    {number && (
                      <Button variant="ghost" size="icon-sm" onClick={handleBackspace}>
                        <Delete className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Dial Pad Grid */}
                <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                  {dialPadKeys.map((key) => (
                    <button
                      key={key.label}
                      onClick={() => handleKeyPress(key.label)}
                      className={cn(
                        'h-16 rounded-xl flex flex-col items-center justify-center',
                        'bg-muted/50 hover:bg-muted active:bg-muted/80 transition-colors',
                        'text-lg font-semibold',
                      )}
                    >
                      <span>{key.label}</span>
                      {key.sub && <span className="text-[10px] text-muted-foreground tracking-widest">{key.sub}</span>}
                    </button>
                  ))}
                </div>

                {/* Call / End Buttons */}
                <div className="flex justify-center gap-4 mt-6">
                  <Button
                    size="lg"
                    className="rounded-full h-14 w-14 bg-green-600 hover:bg-green-700"
                    onClick={handleDial}
                    disabled={isCalling || callLoading || !number.trim()}
                  >
                    {isCalling || callLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Phone className="h-6 w-6" />
                    )}
                  </Button>
                  {isCalling && (
                    <Button
                      size="lg"
                      className="rounded-full h-14 w-14 bg-red-600 hover:bg-red-700"
                      onClick={() => setIsCalling(false)}
                    >
                      <PhoneOff className="h-6 w-6" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Recent Calls */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> Recent Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentCalls.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No recent calls</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentCalls.map((call) => {
                    const isInbound = call.direction === 'inbound';
                    const displayNumber = isInbound ? call.from : call.to;
                    return (
                      <div
                        key={call.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer group"
                        onClick={() => handleRecentCallDial(displayNumber)}
                      >
                        <div className={cn(
                          'h-9 w-9 rounded-full flex items-center justify-center shrink-0',
                          call.status === 'no_answer'
                            ? 'bg-red-100 dark:bg-red-900/30'
                            : isInbound
                            ? 'bg-blue-100 dark:bg-blue-900/30'
                            : 'bg-green-100 dark:bg-green-900/30',
                        )}>
                          <Phone className={cn(
                            'h-4 w-4',
                            call.status === 'no_answer'
                              ? 'text-red-600 dark:text-red-400'
                              : isInbound
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-green-600 dark:text-green-400',
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium font-mono truncate">{displayNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(call.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {call.duration > 0 && ` - ${formatDuration(call.duration)}`}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/communication/calls/${call.id}`);
                          }}
                        >
                          <User className="h-3.5 w-3.5" />
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
    </div>
  );
}
