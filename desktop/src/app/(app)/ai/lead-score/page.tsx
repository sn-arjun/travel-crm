'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Target, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

export default function LeadScoreIndexPage() {
  const router = useRouter();
  const [leadId, setLeadId] = React.useState('');

  const handleScore = () => {
    if (!leadId.trim()) {
      toast.error('Please enter a lead ID');
      return;
    }
    router.push(`/ai/lead-score/${leadId.trim()}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Lead Scoring</h1>
        <p className="text-muted-foreground mt-1">
          Get AI-powered scoring with factor breakdown and recommendations
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950/30">
            <Target className="h-5 w-5 text-red-600" />
          </div>
          <CardTitle className="text-lg mt-3">Score a Lead</CardTitle>
          <CardDescription>
            Enter a lead ID to get a detailed AI-powered score breakdown with recommendations on how to improve conversion chances.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-id">Lead ID</Label>
            <Input
              id="lead-id"
              placeholder="Enter lead ID..."
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleScore()}
            />
          </div>
          <Button onClick={handleScore} disabled={!leadId.trim()} className="w-full gap-2">
            <Target className="h-4 w-4" />
            Get Lead Score
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
