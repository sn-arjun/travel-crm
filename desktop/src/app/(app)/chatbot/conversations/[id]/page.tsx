'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bot, Briefcase, Clock, Globe, Loader2, MessageCircle, MessageSquare, Send, User, UserPlus, X,
} from 'lucide-react';
import { DetailPage, RelationCombobox } from '@/components/domain';
import {
  Button, Skeleton, EmptyState, Tag, SectionCard, Textarea, Label,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui';
import type { TimelineItem } from '@/components/ui/timeline';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import {
  chatbotApi,
  type ChatbotConversation,
  type SendReplyRequest,
  type HandoffRequest,
} from '@/lib/api/chatbot';
import { usersApi } from '@/lib/api/users';
import type { User as TeamUser } from '@travelcrm/shared';
import { toast } from 'sonner';

/** Shows the teammate a conversation was handed to by name instead of a raw id. */
function HandedOffTo({ userId }: { userId: string }) {
  const [name, setName] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    usersApi.getById(userId)
      .then((res) => { if (!cancelled) setName(res.data?.name || res.data?.email || null); })
      .catch(() => { if (!cancelled) setName(null); });
    return () => { cancelled = true; };
  }, [userId]);
  return <span className="text-xs text-ds-foreground-muted">Handed to: {name ?? 'a teammate'}</span>;
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'handed_off') return 'warning';
  return 'neutral';
}

function channelIcon(channel: string) {
  if (channel === 'web') return <Globe className="size-4" aria-hidden="true" />;
  if (channel === 'whatsapp') return <MessageSquare className="size-4" aria-hidden="true" />;
  return <MessageCircle className="size-4" aria-hidden="true" />;
}

export default function ConversationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params.id as string;
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const [replyText, setReplyText] = React.useState('');
  const [showHandoff, setShowHandoff] = React.useState(false);
  const [handoffAssignTo, setHandoffAssignTo] = React.useState('');
  const [handoffReason, setHandoffReason] = React.useState('');

  const { data: convoResponse, loading, error, refetch } = useApiQuery(
    () => chatbotApi.conversations.getById(conversationId),
    [conversationId],
  );

  const { mutate: sendReply, loading: sending } = useApiMutation(
    (data: SendReplyRequest) => chatbotApi.reply.send(conversationId, data),
  );
  const { mutate: handoff, loading: handingOff } = useApiMutation(
    (data: HandoffRequest) => chatbotApi.handoff.send(conversationId, data),
  );
  const { mutate: closeConvo, loading: closing } = useApiMutation(
    (data: { notes?: string }) => chatbotApi.conversations.close(conversationId, data),
  );
  const { mutate: createLead, loading: creatingLead } = useApiMutation(
    () => chatbotApi.conversations.createLead(conversationId),
  );

  const conversation: ChatbotConversation | null = convoResponse?.data ?? null;
  const messages = conversation?.messages ?? [];

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSendReply() {
    if (!replyText.trim()) return;
    const result = await sendReply({ message: replyText.trim() });
    if (result) {
      setReplyText('');
      refetch();
    } else {
      toast.error('Failed to send reply');
    }
  }

  async function handleHandoff() {
    if (!handoffAssignTo) {
      toast.error('Please choose a team member to hand off to');
      return;
    }
    const result = await handoff({ assignTo: handoffAssignTo, reason: handoffReason || undefined });
    if (result) {
      toast.success('Conversation handed off');
      setShowHandoff(false);
      setHandoffAssignTo('');
      setHandoffReason('');
      refetch();
    } else {
      toast.error('Failed to hand off conversation');
    }
  }

  async function handleClose() {
    const result = await closeConvo({});
    if (result) {
      toast.success('Conversation closed');
      refetch();
    } else {
      toast.error('Failed to close conversation');
    }
  }

  async function handleCreateLead() {
    const result = await createLead(undefined);
    if (result?.data?.id) {
      toast.success('Lead created from conversation');
      router.push(`/leads/${result.data.id}`);
    } else {
      toast.error('Failed to create lead');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <EmptyState
        title="Conversation not found"
        description="This conversation could not be loaded."
        action={<Button variant="outline" onClick={() => router.back()}>Go back</Button>}
      />
    );
  }

  const activity: TimelineItem[] = messages.map((m) => ({
    id: m.id,
    title: m.sender === 'bot' ? 'Bot' : (conversation.visitorName || 'Visitor'),
    description: m.text,
    timestamp: new Date(m.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    icon: m.sender === 'bot' ? <Bot className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />,
  }));

  return (
    <>
      <DetailPage<ChatbotConversation>
        entity={conversation}
        title={conversation.visitorName || conversation.visitorEmail || 'Anonymous visitor'}
        subtitle={`Started ${new Date(conversation.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
        status={<Tag tone={statusTone(conversation.status)}>{conversation.status.replace('_', ' ')}</Tag>}
        onBack={() => router.back()}
        messaging={conversation.visitorEmail ? {
          recipientId: conversation.id,
          recipientName: conversation.visitorName || conversation.visitorEmail,
          email: conversation.visitorEmail,
        } : undefined}
        primaryActions={
          conversation.status === 'active' ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowHandoff(true)} className="gap-ds-2">
                <UserPlus aria-hidden="true" /> Hand off
              </Button>
              <Button variant="outline" size="sm" onClick={handleClose} disabled={closing} className="gap-ds-2">
                <X aria-hidden="true" /> Close
              </Button>
            </>
          ) : undefined
        }
        actions={[
          {
            label: 'Create lead',
            icon: <Briefcase />,
            onSelect: handleCreateLead,
            disabled: creatingLead,
          },
        ]}
        overview={
          <div className="grid gap-ds-4 sm:grid-cols-3">
            <SectionCard title="Conversation" className="sm:col-span-2">
              <div className="flex h-96 flex-col">
                <div className="flex-1 space-y-ds-4 overflow-auto pr-ds-1">
                  {messages.map((msg) => {
                    const isBot = msg.sender === 'bot';
                    return (
                      <div key={msg.id} className={`flex max-w-[75%] gap-ds-2 ${isBot ? '' : 'ml-auto flex-row-reverse'}`}>
                        <div className={`mt-ds-1 flex size-7 shrink-0 items-center justify-center rounded-ds-full ${isBot ? 'bg-ds-info-subtle' : 'bg-ds-surface-sunken'}`}>
                          {isBot ? <Bot className="size-3.5 text-ds-info" aria-hidden="true" /> : <User className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />}
                        </div>
                        <div>
                          <div className={`rounded-ds-lg px-ds-3 py-ds-2 text-sm ${isBot ? 'bg-ds-info-subtle text-ds-foreground' : 'bg-ds-surface-sunken text-ds-foreground'}`}>
                            {msg.text}
                          </div>
                          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
                            {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {conversation.status !== 'closed' && (
                  <div className="mt-ds-3 flex items-end gap-ds-2 border-t border-ds-border pt-ds-3">
                    <Textarea
                      placeholder="Type a reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      rows={2}
                      className="resize-none"
                    />
                    <Button onClick={handleSendReply} disabled={sending || !replyText.trim()} className="shrink-0" aria-label="Send reply">
                      {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>

            <div className="flex flex-col gap-ds-4">
              <SectionCard title="Visitor info">
                <div className="flex flex-col gap-ds-3 text-sm">
                  {conversation.visitorName && (
                    <div className="flex items-center gap-ds-2">
                      <User className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                      <span>{conversation.visitorName}</span>
                    </div>
                  )}
                  {conversation.visitorEmail && (
                    <div className="flex items-center gap-ds-2">
                      <MessageSquare className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                      <span>{conversation.visitorEmail}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-ds-2">
                    {channelIcon(conversation.channel)}
                    <span className="capitalize">{conversation.channel}</span>
                  </div>
                  <div className="flex items-center gap-ds-2">
                    <Clock className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                    <span className="text-xs text-ds-foreground-muted">
                      Started {new Date(conversation.startedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {conversation.endedAt && (
                    <div className="flex items-center gap-ds-2">
                      <Clock className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                      <span className="text-xs text-ds-foreground-muted">
                        Ended {new Date(conversation.endedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                  {conversation.handedOffTo && (
                    <div className="flex items-center gap-ds-2">
                      <UserPlus className="size-3.5 text-ds-foreground-muted" aria-hidden="true" />
                      <HandedOffTo userId={conversation.handedOffTo} />
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Stats">
                <div className="flex flex-col gap-ds-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">Messages</span>
                    <span className="font-medium">{messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">Bot messages</span>
                    <span className="font-medium">{messages.filter((m) => m.sender === 'bot').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ds-foreground-muted">User messages</span>
                    <span className="font-medium">{messages.filter((m) => m.sender === 'user').length}</span>
                  </div>
                </div>
              </SectionCard>

              {conversation.notes && (
                <SectionCard title="Notes">
                  <p className="text-xs text-ds-foreground-muted">{conversation.notes}</p>
                </SectionCard>
              )}
            </div>
          </div>
        }
        activity={activity}
      />

      <Dialog open={showHandoff} onOpenChange={setShowHandoff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand off conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label>Assign to <span className="text-ds-danger">*</span></Label>
              <RelationCombobox<TeamUser>
                value={handoffAssignTo || null}
                onChange={(id) => setHandoffAssignTo(id ?? '')}
                fetcher={async (q, page) => {
                  const r = await usersApi.list({ search: q, page, limit: 20 });
                  return { items: r.data, total: r.pagination.total };
                }}
                getOptionId={(u) => u.id}
                getOptionLabel={(u) => u.name || u.email}
                getOptionDescription={(u) => u.email}
                resolveSelected={async (id) => (await usersApi.getById(id)).data}
                placeholder="Select a team member"
                searchPlaceholder="Search team…"
              />
            </div>
            <div className="space-y-ds-2">
              <Label>Reason</Label>
              <Textarea
                placeholder="Reason for handoff..."
                value={handoffReason}
                onChange={(e) => setHandoffReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHandoff(false)}>Cancel</Button>
            <Button onClick={handleHandoff} disabled={handingOff}>
              {handingOff ? 'Handing off...' : 'Hand off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
