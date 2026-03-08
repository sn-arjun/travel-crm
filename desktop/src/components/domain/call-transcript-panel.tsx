'use client';

import * as React from 'react';
import { Copy, Plus, Volume2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TranscriptLine {
  timestamp: string;
  speaker: 'Agent' | 'Customer';
  text: string;
}

interface CallTranscriptPanelProps {
  callId: string;
  callerName?: string;
  onCreateLead?: () => void;
  onAddFollowUp?: () => void;
}

export function CallTranscriptPanel({ callId, callerName = 'Customer', onCreateLead, onAddFollowUp }: CallTranscriptPanelProps) {
  const [copiedLine, setCopiedLine] = React.useState<string | null>(null);

  const transcriptLines: TranscriptLine[] = [
    { timestamp: '00:00', speaker: 'Agent', text: 'Hello, this is Arjun from TravelCRM. How can I help you today?' },
    { timestamp: '00:05', speaker: 'Customer', text: 'Hi, I\'m looking to book a vacation package for my family. We want to go somewhere tropical.' },
    { timestamp: '00:15', speaker: 'Agent', text: 'That sounds wonderful! Do you have a specific destination in mind, or would you like some recommendations?' },
    { timestamp: '00:23', speaker: 'Customer', text: 'We\'re interested in the Maldives. We heard it\'s beautiful and family-friendly.' },
    { timestamp: '00:35', speaker: 'Agent', text: 'Excellent choice! The Maldives is perfect for families. When are you planning to travel, and how many people will be going?' },
    { timestamp: '00:47', speaker: 'Customer', text: 'We\'re thinking May or June, and there will be 4 of us - 2 adults and 2 children.' },
    { timestamp: '01:05', speaker: 'Agent', text: 'Perfect timing! May and June offer great weather. I can prepare a custom package for you. What\'s your approximate budget?' },
    { timestamp: '01:18', speaker: 'Customer', text: 'We\'re looking to spend around 150,000 to 200,000 rupees per person including flights and accommodation.' },
    { timestamp: '01:35', speaker: 'Agent', text: 'Excellent. I\'ll create a detailed itinerary and send you a quote by tomorrow. Can I get your email and phone number?' },
    { timestamp: '01:48', speaker: 'Customer', text: 'Sure, it\'s amit@email.com and 9876543210. Thanks!' },
  ];

  const aiSummary = {
    keyPoints: [
      'Family of 4 interested in Maldives vacation',
      'Preferred travel dates: May or June 2026',
      'Budget: 150,000-200,000 INR per person',
      'Looking for package including flights and accommodation',
    ],
    actionItems: ['Send detailed itinerary', 'Prepare quote', 'Confirm availability', 'Follow up with quote by tomorrow'],
    sentiment: 'Positive' as const,
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLine(text);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedLine(null), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Transcript Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Call Transcript</CardTitle>
            <Badge variant="secondary">10 min 48 sec</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{callId}</p>
        </CardHeader>

        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-4">
            {transcriptLines.map((line, idx) => (
              <div key={idx} className="group">
                <div className="flex gap-3">
                  {/* Timestamp and Speaker */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-xs font-mono text-muted-foreground">{line.timestamp}</span>
                    <Badge
                      variant={line.speaker === 'Agent' ? 'default' : 'secondary'}
                      className={cn(
                        'text-xs px-1.5 py-0.5',
                        line.speaker === 'Agent' && 'bg-blue-600 text-white dark:bg-blue-700',
                        line.speaker === 'Customer' && 'bg-gray-600 text-white dark:bg-gray-700',
                      )}
                    >
                      {line.speaker}
                    </Badge>
                  </div>

                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed break-words">{line.text}</p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <Button
                      onClick={() => handleCopyText(line.text)}
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                    >
                      <Copy className="h-3 w-3" />
                      <span className="sr-only">Copy</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Summary Card */}
      <Card className="bg-gradient-to-br from-blue-50 to-blue-50/50 dark:from-blue-950/20 dark:to-blue-950/10 border-blue-200/50 dark:border-blue-800/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-blue-900 dark:text-blue-100">AI Summary</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Key Points */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-200 mb-2">Key Points</p>
            <ul className="space-y-1.5">
              {aiSummary.keyPoints.map((point, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-blue-900 dark:text-blue-100">
                  <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <Separator className="bg-blue-200/30 dark:bg-blue-800/30" />

          {/* Action Items */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-200 mb-2">Action Items</p>
            <ul className="space-y-1.5">
              {aiSummary.actionItems.map((item: any, idx: any) => (
                <li key={idx} className="flex gap-2 text-sm text-blue-900 dark:text-blue-100">
                  <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <Separator className="bg-blue-200/30 dark:bg-blue-800/30" />

          {/* Sentiment */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-200">Sentiment</p>
            <Badge className="bg-emerald-600 text-white dark:bg-emerald-700">{aiSummary.sentiment}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={onCreateLead} className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Create Lead
        </Button>
        <Button onClick={onAddFollowUp} variant="outline" className="w-full gap-2">
          <Plus className="h-4 w-4" />
          Add Follow-up
        </Button>
      </div>
    </div>
  );
}
