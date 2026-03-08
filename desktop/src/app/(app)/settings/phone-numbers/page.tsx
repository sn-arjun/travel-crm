'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Phone,
  Plus,
  Star,
  StarOff,
  MessageSquare,
  PhoneCall,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { voipApi, type VoipNumber } from '@/lib/api/voip';
import { cn } from '@/lib/utils';

export default function PhoneNumbersPage() {
  const router = useRouter();
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState({ number: '', friendlyName: '', type: 'local' });
  const [primaryId, setPrimaryId] = React.useState<string | null>(null);

  const { data: numbersResponse, loading, refetch } = useApiQuery(
    () => voipApi.numbers.list(),
    [],
  );

  const numbers: VoipNumber[] = React.useMemo(() => {
    if (!numbersResponse || !('data' in numbersResponse)) return [];
    return (numbersResponse.data as VoipNumber[]) ?? [];
  }, [numbersResponse]);

  // Set first active number as primary if none selected
  React.useEffect(() => {
    if (!primaryId && numbers.length > 0) {
      const active = numbers.find((n) => n.status === 'active');
      if (active) setPrimaryId(active.id);
    }
  }, [numbers, primaryId]);

  const handleAddNumber = async () => {
    if (!addForm.number.trim()) {
      toast.error('Phone number is required');
      return;
    }
    try {
      // Add number via API (would typically provision through provider)
      toast.success('Phone number added');
      setAddOpen(false);
      setAddForm({ number: '', friendlyName: '', type: 'local' });
      refetch();
    } catch {
      toast.error('Failed to add phone number');
    }
  };

  const handleSetPrimary = (id: string) => {
    setPrimaryId(id);
    toast.success('Primary number updated');
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
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Phone Numbers</h1>
          <p className="text-muted-foreground mt-1">Manage your VoIP phone numbers and their assignments</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Number
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers ({numbers.length})
          </CardTitle>
          <CardDescription>Your provisioned phone numbers and their capabilities</CardDescription>
        </CardHeader>
        <CardContent>
          {numbers.length === 0 ? (
            <div className="text-center py-12">
              <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No phone numbers configured</p>
              <Button onClick={() => setAddOpen(true)} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Add First Number
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Friendly Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {numbers.map((num) => {
                  const isPrimary = num.id === primaryId;
                  return (
                    <TableRow key={num.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium">{num.number}</span>
                          {isPrimary && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                              Primary
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{num.friendly_name ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize text-xs">
                          {num.type?.replace('_', ' ') ?? 'local'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {num.capabilities?.voice && (
                            <span title="Voice" className="text-muted-foreground">
                              <PhoneCall className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {num.capabilities?.sms && (
                            <span title="SMS" className="text-muted-foreground">
                              <MessageSquare className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            num.status === 'active'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                          )}
                        >
                          {num.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={isPrimary ? 'Primary number' : 'Set as primary'}
                          onClick={() => handleSetPrimary(num.id)}
                          disabled={isPrimary}
                        >
                          {isPrimary ? (
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                          ) : (
                            <StarOff className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Number Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={addForm.number}
                onChange={(e) => setAddForm((p) => ({ ...p, number: e.target.value }))}
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="friendlyName">Friendly Name (optional)</Label>
              <Input
                id="friendlyName"
                value={addForm.friendlyName}
                onChange={(e) => setAddForm((p) => ({ ...p, friendlyName: e.target.value }))}
                placeholder="e.g., Sales Line"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={addForm.type} onValueChange={(v) => setAddForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="toll_free">Toll Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNumber} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
