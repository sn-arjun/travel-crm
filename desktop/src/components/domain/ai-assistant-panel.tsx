'use client';

import * as React from 'react';
import { Sparkles, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  'Create a lead for Amit Kumar interested in Bali',
  'Generate itinerary for Maldives 5-day package',
  "What's my pipeline status today?",
  'Show overdue follow-ups',
];

const AI_RESPONSES: Record<string, string> = {
  lead: 'I can help you create a new lead. I would need the customer name, phone number, destination, travel dates, and budget. Would you like me to create a lead for Amit Kumar right now?',
  itinerary:
    'For a 5-day Maldives package, I recommend: Day 1 - Arrival and resort check-in, Day 2-4 - Water sports, snorkeling, and island tours, Day 5 - Spa and departure. The estimated budget would be around 150,000 INR per person.',
  pipeline: 'Your current pipeline status: 8 hot leads, 12 warm leads, 5 cold leads. Total pipeline value: 28.5 lakhs. Your conversion rate is 23%.',
  followups: 'You have 5 overdue follow-ups: 1) Priya Patel - Maldives inquiry, 2) Rajesh Joshi - Bali proposal, 3) Sneha Reddy - Europe itinerary, 4) Vikram Singh - Dubai booking, 5) Meera Nair - Thailand visa check.',
  default: 'I can help with lead management, pipeline analysis, follow-up reminders, and travel itinerary generation. What would you like assistance with?',
};

function getMockResponse(query: string): string {
  const lowerQuery = query.toLowerCase();
  if (lowerQuery.includes('lead') || lowerQuery.includes('create')) return AI_RESPONSES['lead'] ?? '';
  if (lowerQuery.includes('itinerary') || lowerQuery.includes('maldives')) return AI_RESPONSES['itinerary'] ?? '';
  if (lowerQuery.includes('pipeline') || lowerQuery.includes('status')) return AI_RESPONSES['pipeline'] ?? '';
  if (lowerQuery.includes('follow') || lowerQuery.includes('overdue')) return AI_RESPONSES['followups'] ?? '';
  return AI_RESPONSES['default'] ?? '';
}

export function AIAssistantPanel({ open, onClose }: AIAssistantPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Keyboard shortcut
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        // This would toggle the panel in a real app
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 800));

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: getMockResponse(text),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  };

  const handleSuggestedPrompt = (prompt: string) => {
    handleSendMessage(prompt);
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-96 shadow-xl animate-slide-left">
        <Card className="h-full flex flex-col rounded-none border-l bg-card">
          {/* Header */}
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold">AI Assistant</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center space-y-4 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-sm">AI Assistant Ready</p>
                  <p className="text-xs text-muted-foreground">Ask me about leads, pipelines, or travel itineraries</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shortcut: <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">Cmd+Shift+A</kbd>
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg: any) => (
                  <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {msg.role === 'assistant' && <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />}
                    <div
                      className={cn(
                        'max-w-xs px-3 py-2 rounded-lg text-sm',
                        msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted text-foreground rounded-bl-none',
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="bg-muted rounded-lg px-3 py-2 rounded-bl-none">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Suggested Prompts or Input */}
          {messages.length === 0 ? (
            <div className="border-t p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium mb-2">Suggested prompts:</p>
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="w-full text-left text-xs p-2 rounded-lg hover:bg-muted transition-colors border border-border/50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Ask me anything..."
                value={inputValue}
                onChange={(e) => setInputValue(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(inputValue);
                  }
                }}
                disabled={isLoading}
                className="text-sm"
              />
              <Button
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                size="sm"
                className="px-3"
              >
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
