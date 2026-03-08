'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Monitor,
  Smartphone,
  Trash2,
  LogOut,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { authApi } from '@/lib/api/auth';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { cn } from '@/lib/utils';

interface BackendSession {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  loginAt: string;
  isCurrent: boolean;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SessionsSettingsPage() {
  const router = useRouter();

  const { data: sessionsResponse, loading, refetch } = useApiQuery(
    () => authApi.getSessions(),
    [],
  );

  const sessions: BackendSession[] = React.useMemo(() => {
    if (!sessionsResponse || !('data' in sessionsResponse)) return [];
    return (sessionsResponse.data as BackendSession[]) ?? [];
  }, [sessionsResponse]);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await client.delete(`${API_ENDPOINTS.auth.sessions}/${sessionId}`);
      toast.success('Session revoked');
      refetch();
    } catch {
      toast.error('Failed to revoke session');
    }
  };

  const handleRevokeAllOthers = async () => {
    try {
      await client.delete(API_ENDPOINTS.auth.sessions);
      toast.success('All other sessions revoked');
      refetch();
    } catch {
      toast.error('Failed to revoke sessions');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Sessions</h1>
          <p className="text-muted-foreground mt-1">Manage your active login sessions across devices</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sessions ({sessions.length})
            </CardTitle>
            <CardDescription>Devices and browsers where you are currently logged in</CardDescription>
          </div>
          {sessions.length > 1 && (
            <Button variant="destructive" size="sm" className="gap-2" onClick={handleRevokeAllOthers}>
              <LogOut className="h-4 w-4" />
              Revoke All Others
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No active sessions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Browser / OS</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Login Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => {
                  const isMobile = session.device?.toLowerCase() === 'mobile';
                  return (
                    <TableRow key={session.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isMobile ? (
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="capitalize">{session.device || 'Desktop'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{session.browser || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{session.os || 'Unknown'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{session.ipAddress ?? '-'}</TableCell>
                      <TableCell className="text-sm">{formatDate(session.loginAt)}</TableCell>
                      <TableCell>
                        {session.isCurrent ? (
                          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Current
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!session.isCurrent && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRevokeSession(session.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
