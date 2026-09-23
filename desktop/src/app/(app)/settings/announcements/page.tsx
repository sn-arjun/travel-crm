'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Megaphone, Loader2, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { notificationsApi } from '@/lib/api/notifications';

const TARGET_ROLES = [
  { value: 'all', label: 'All Team Members' },
  { value: 'admin', label: 'Admins Only' },
  { value: 'sales_manager', label: 'Sales Managers' },
  { value: 'salesperson', label: 'Salespersons' },
  { value: 'accountant', label: 'Accountants' },
];

export default function AnnouncementsPage() {
  const router = useRouter();
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [targetRole, setTargetRole] = React.useState('all');
  const [sending, setSending] = React.useState(false);

  const handleSend = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!body.trim()) { toast.error('Message body is required'); return; }

    setSending(true);
    try {
      const result = await notificationsApi.announce({
        title: title.trim(),
        body: body.trim(),
        targetRole: targetRole === 'all' ? undefined : targetRole,
      });
      if (result && 'data' in result) {
        const sent = (result.data as any)?.sent ?? 0;
        toast.success(`Announcement sent to ${sent} team member${sent !== 1 ? 's' : ''}`);
        setTitle('');
        setBody('');
        setTargetRole('all');
      }
    } catch {
      toast.error('Failed to send announcement');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Send Announcement</h1>
          <p className="text-muted-foreground mt-1">Broadcast a message to your team</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            New Announcement
          </CardTitle>
          <CardDescription>
            Announcements bypass quiet hours and are delivered as in-app notifications to all selected recipients.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Target */}
          <div className="space-y-2">
            <Label htmlFor="target" className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Recipients <span className="text-destructive">*</span>
            </Label>
            <Select value={targetRole} onValueChange={setTargetRole}>
              <SelectTrigger id="target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="ann-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ann-title"
              placeholder="Announcement title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground text-right">{title.length}/120</p>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label htmlFor="ann-body">
              Message <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="ann-body"
              placeholder="Write your announcement..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground text-right">{body.length}/1000</p>
          </div>

          {/* Preview */}
          {(title || body) && (
            <div className="rounded-ds-md border border-ds-info bg-ds-info-subtle p-ds-4">
              <p className="mb-ds-2 text-xs font-semibold uppercase tracking-wide text-ds-info-on-subtle">Preview</p>
              <p className="text-sm font-semibold">{title || 'Untitled'}</p>
              <p className="mt-ds-1 whitespace-pre-wrap text-sm text-ds-foreground-muted">{body}</p>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={handleSend} disabled={sending || !title.trim() || !body.trim()} className="gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send Announcement
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
