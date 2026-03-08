'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Send, User, Bot, Loader, Loader2, AlertCircle,
  Globe, MessageSquare, MessageCircle, UserPlus, Clock,
  Mail, Phone, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import {
  chatbotApi,
  type ChatbotConversation,
  type ChatbotMessage,
  type SendReplyRequest,
  type HandoffRequest,
} from '@/lib/api/chatbot';

function channelIcon(channel: string) {
  switch (channel) {
    case 'web': return <Globe className="h-4 w-4" />;
    case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
    case 'facebook': return <MessageCircle className="h-4 w-4" />;
    default: return <MessageCircle className="h-4 w-4" />;
  }
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
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

  const { data: convoResponse, loading, error, refetch } = useApiQuery<any>(
    () => chatbotApi.conversations.getById(conversationId),
    [conversationId],
  );

  const { mutate: sendReply, loading: sending } = useApiMutation(
    (data: SendReplyRequest) => chatbotApi.reply.send(conversationId, data),
  );

  const { mutate: handoff, loading: handingOff } = useApiMutation(
    (data: HandoffRequest) => chatbotApi.handoff.send(conversationId, data),
  );

  const { mutate: closeConvo } = useApiMutation(
    (data: { notes?: string }) => chatbotApi.conversations.close(conversationId, data),
  );

  const conversation: ChatbotConversation | null = convoResponse?.data ?? null;
  const messages: ChatbotMessage[] = conversation?.messages ?? [];

  // Scroll to bottom on new messages
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
    if (!handoffAssignTo.trim()) {
      toast.error('Please specify who to hand off to');
      return;
    }

    const result = await handoff({
      assignTo: handoffAssignTo.trim(),
      reason: handoffReason || undefined,
    });

    if (result) {
      toast.success('Conversation handed off');
      setShowHandoff(false);
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

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Failed to load conversation</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className={cn(
              'h-8 w-8 rounded-full flex items-center justify-center',
              conversation.status === 'active'
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-gray-100 dark:bg-gray-800',
            )}>
              <User className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {conversation.visitorName || conversation.visitorEmail || 'Anonymous Visitor'}
              </p>
              <div className="flex items-center gap-2">
                {channelIcon(conversation.channel)}
                <span className="text-xs text-muted-foreground capitalize">{conversation.channel}</span>
                <Badge variant="outline" className={cn(
                  'text-[10px] border-transparent',
                  conversation.status === 'active' && 'bg-green-100 text-green-700',
                  conversation.status === 'closed' && 'bg-gray-100 text-gray-700',
                  conversation.status === 'handed_off' && 'bg-amber-100 text-amber-700',
                )}>
                  {conversation.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.status === 'active' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowHandoff(true)}>
                <UserPlus className="h-4 w-4 mr-1.5" /> Hand Off
              </Button>
              <Button variant="outline" size="sm" onClick={handleClose}>
                <X className="h-4 w-4 mr-1.5" /> Close
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Conversation start */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                Conversation started {formatDate(conversation.startedAt)} at {formatTime(conversation.startedAt)}
              </p>
            </div>

            {messages.map((msg) => {
              const isBot = msg.sender === 'bot';
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex gap-2 max-w-[75%]',
                    isBot ? '' : 'ml-auto flex-row-reverse',
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-1',
                    isBot ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800',
                  )}>
                    {isBot ? (
                      <Bot className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <User className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                    )}
                  </div>
                  <div>
                    <div className={cn(
                      'rounded-lg px-3 py-2 text-sm',
                      isBot
                        ? 'bg-blue-50 dark:bg-blue-950/30 text-foreground'
                        : 'bg-muted text-foreground',
                    )}>
                      {msg.text}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {msg.attachments.map((att, i) => (
                          <a
                            key={i}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline block"
                          >
                            {att.name || att.url}
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply Input */}
          {conversation.status !== 'closed' && (
            <div className="border-t p-4">
              <div className="flex items-end gap-2">
                <Textarea
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  className="resize-none"
                />
                <Button
                  onClick={handleSendReply}
                  disabled={sending || !replyText.trim()}
                  className="shrink-0"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Visitor Info */}
        <div className="w-72 border-l overflow-auto p-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Visitor Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {conversation.visitorName && (
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{conversation.visitorName}</span>
                </div>
              )}
              {conversation.visitorEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{conversation.visitorEmail}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                {channelIcon(conversation.channel)}
                <span className="text-sm capitalize">{conversation.channel}</span>
              </div>
              <Separator />
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Started {formatDate(conversation.startedAt)}
                </span>
              </div>
              {conversation.endedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Ended {formatDate(conversation.endedAt)}
                  </span>
                </div>
              )}
              {conversation.handedOffTo && (
                <div className="flex items-center gap-2">
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Handed to: {conversation.handedOffTo}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Conversation Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Messages</span>
                <span className="font-medium">{messages.length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Bot Messages</span>
                <span className="font-medium">{messages.filter((m) => m.sender === 'bot').length}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">User Messages</span>
                <span className="font-medium">{messages.filter((m) => m.sender === 'user').length}</span>
              </div>
            </CardContent>
          </Card>

          {conversation.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{conversation.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Handoff Dialog */}
      <Dialog open={showHandoff} onOpenChange={setShowHandoff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hand Off Conversation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign To <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Agent name or ID"
                value={handoffAssignTo}
                onChange={(e) => setHandoffAssignTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
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
              {handingOff ? 'Handing off...' : 'Hand Off'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
