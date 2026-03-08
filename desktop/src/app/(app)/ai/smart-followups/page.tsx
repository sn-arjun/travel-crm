'use client';

import * as React from 'react';
import {
  BellRing,
  Loader2,
  Calendar,
  CheckCircle2,
  X,
  Edit,
  Clock,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { aiApi, type SmartFollowup } from '@/lib/api/ai';

interface FollowupEntry {
  leadId: string;
  leadName: string;
  followup: SmartFollowup;
  status: 'pending' | 'accepted' | 'dismissed';
}

export default function SmartFollowupsPage() {
  const [leadId, setLeadId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [entries, setEntries] = React.useState<FollowupEntry[]>([]);

  const handleFetch = async () => {
    if (!leadId.trim()) {
      toast.error('Please enter a lead ID');
      return;
    }

    setLoading(true);
    try {
      const response = await aiApi.intelligence.getSmartFollowup(leadId.trim());
      const newEntry: FollowupEntry = {
        leadId: leadId.trim(),
        leadName: `Lead ${leadId.trim()}`,
        followup: response.data,
        status: 'pending',
      };
      setEntries((prev) => [newEntry, ...prev]);
      setLeadId('');
      toast.success('Smart follow-up fetched');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to get follow-up suggestion';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = (index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, status: 'accepted' as const } : e)),
    );
    toast.success('Follow-up accepted and scheduled');
  };

  const handleDismiss = (index: number) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, status: 'dismissed' as const } : e)),
    );
    toast.info('Follow-up dismissed');
  };

  const pendingEntries = entries.filter((e) => e.status === 'pending');
  const processedEntries = entries.filter((e) => e.status !== 'pending');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Smart Follow-ups</h1>
        <p className="text-muted-foreground mt-1">
          AI-suggested follow-up actions and optimal timing for your leads
        </p>
      </div>

      {/* Fetch Follow-up */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter a lead ID to get smart follow-up suggestions..."
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                className="pl-10"
              />
            </div>
            <Button onClick={handleFetch} disabled={loading || !leadId.trim()} className="gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BellRing className="h-4 w-4" />
              )}
              Get Suggestions
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Pending */}
      {pendingEntries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            Pending Actions ({pendingEntries.length})
          </h2>
          {pendingEntries.map((entry, idx) => {
            const realIdx = entries.indexOf(entry);
            return (
              <Card key={idx}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-50 dark:bg-pink-950/30 shrink-0">
                      <BellRing className="h-5 w-5 text-pink-600" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{entry.leadName}</p>
                          <p className="text-xs text-muted-foreground">ID: {entry.leadId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {new Date(entry.followup.nextFollowUpDate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {entry.followup.tone && (
                        <Badge variant="outline" className="text-xs">
                          Tone: {entry.followup.tone}
                        </Badge>
                      )}

                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                          Suggested Actions
                        </p>
                        <ul className="space-y-1">
                          {entry.followup.suggestedActions.map((action, actionIdx) => (
                            <li
                              key={actionIdx}
                              className="flex items-start gap-2 text-sm rounded-lg border p-2"
                            >
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <Separator />

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => handleAccept(realIdx)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => handleDismiss(realIdx)}
                        >
                          <X className="h-3.5 w-3.5" />
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Processed */}
      {processedEntries.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">
            Processed ({processedEntries.length})
          </h2>
          {processedEntries.map((entry, idx) => (
            <Card key={idx} className="opacity-60">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {entry.status === 'accepted' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <X className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{entry.leadName}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.status === 'accepted' ? 'Accepted & scheduled' : 'Dismissed'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={entry.status === 'accepted' ? 'default' : 'secondary'}>
                    {entry.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {entries.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <BellRing className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No follow-up suggestions yet</p>
              <p className="text-xs mt-1">
                Enter a lead ID above to get AI-powered follow-up suggestions
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
