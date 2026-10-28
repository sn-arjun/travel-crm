// HIDDEN (R112, owner question Q8): this page has no backend API behind it. It is not in the sidebar and next.config.ts redirects its route to /dashboard. Kept for the day the backend gets the feature.
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Breadcrumb } from '@/components/layout/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Send } from 'lucide-react';

interface TicketDetail {
  id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assignee_name: string | null;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface Reply {
  id: string;
  author_type: string;
  author_name: string;
  body: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  resolved: 'bg-green-100 text-green-800',
  closed: 'bg-gray-100 text-gray-800',
};

export default function TicketDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchTicket = useCallback(async () => {
    const res = await fetch(`/api/support/tickets/${id}`);
    const data = await res.json() as { ticket: TicketDetail; replies: Reply[] };
    setTicket(data.ticket);
    setReplies(data.replies || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    await fetch(`/api/support/tickets/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: replyText }),
    });
    setReplyText('');
    setSending(false);
    fetchTicket();
  };

  const handleStatusChange = async (status: string) => {
    await fetch(`/api/support/tickets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    fetchTicket();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!ticket) {
    return <div className="p-8 text-center text-muted-foreground">Ticket not found</div>;
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { label: 'Support', href: '/support' },
        { label: ticket.subject },
      ]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {ticket.tenant_name} &middot; {ticket.created_by_email} &middot; {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={statusColors[ticket.status] || ''}>{ticket.status.replace('_', ' ')}</Badge>
          <Badge variant="outline" className="capitalize">{ticket.priority}</Badge>
          {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
            <>
              {ticket.status === 'open' && (
                <Button size="sm" variant="outline" onClick={() => handleStatusChange('in_progress')}>Start Working</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('resolved')}>Mark Resolved</Button>
            </>
          )}
          {ticket.status === 'resolved' && (
            <Button size="sm" variant="outline" onClick={() => handleStatusChange('closed')}>Close</Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Replies ({replies.length})</h3>
        {replies.map((r) => (
          <Card key={r.id} className={r.author_type === 'admin' ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-gray-300'}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{r.author_name}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{r.body}</p>
            </CardContent>
          </Card>
        ))}

        {ticket.status !== 'closed' && (
          <div className="space-y-2">
            <textarea
              className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px]"
              placeholder="Write a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
            />
            <Button onClick={handleReply} disabled={sending || !replyText.trim()}>
              <Send className="mr-2 h-4 w-4" /> {sending ? 'Sending...' : 'Send Reply'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
