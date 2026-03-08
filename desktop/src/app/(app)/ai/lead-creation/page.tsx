'use client';

import * as React from 'react';
import { Loader2, UserPlus, Copy, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { aiApi, type ExtractedLead } from '@/lib/api/ai';
import { leadsApi } from '@/lib/api/leads';
import { contactsApi } from '@/lib/api/contacts';

export default function LeadCreationPage() {
  const router = useRouter();
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [result, setResult] = React.useState<ExtractedLead | null>(null);

  const handleExtract = async () => {
    if (!text.trim()) {
      toast.error('Please paste some text to extract lead data from');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await aiApi.extractLead({ text });
      setResult(response.data);
      toast.success('Lead data extracted successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to extract lead data';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLead = async () => {
    if (!result) return;
    setIsCreating(true);
    try {
      const name = [result.firstName, result.lastName].filter(Boolean).join(' ') || 'Unknown';
      const contactResponse = await contactsApi.create({
        name,
        email: result.email,
        phone: result.phone,
        type: 'customer',
      });
      const contact = contactResponse?.data;
      if (!contact?.id) throw new Error('Failed to create contact');
      const leadResponse = await leadsApi.create({
        contactId: contact.id,
        title: `Inquiry from ${name}`,
        source: 'website',
        destinations: (result as any).destination ? [(result as any).destination] : ['TBD'],
        travelDate: (result as any).travelDate || new Date().toISOString().split('T')[0],
        tripType: 'domestic',
        notes: result.notes,
      });
      if (leadResponse?.data) {
        toast.success('Lead created successfully from extracted data');
        router.push(`/leads/${leadResponse.data.id}`);
      } else {
        throw new Error('Failed to create lead');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create lead';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 90)
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">{confidence}%</Badge>;
    if (confidence >= 70)
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">{confidence}%</Badge>;
    return <Badge className="bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400">{confidence}%</Badge>;
  };

  const fields = result
    ? [
        { label: 'First Name', value: result.firstName },
        { label: 'Last Name', value: result.lastName },
        { label: 'Email', value: result.email },
        { label: 'Phone', value: result.phone },
        { label: 'Source', value: result.source },
        { label: 'Notes', value: result.notes },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Lead Extraction</h1>
        <p className="text-muted-foreground mt-1">
          Paste an email or inquiry text and let AI extract lead details automatically
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Input Text
            </CardTitle>
            <CardDescription>
              Paste an email, inquiry message, or any text containing lead information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lead-text">Email / Inquiry Text</Label>
              <Textarea
                id="lead-text"
                placeholder={`Example:\n\nHi, I'm John Smith (john@example.com). I'm looking for a 7-day trip to Bali for 4 people in December. Our budget is around $5000. Please contact me at +1-555-0123.\n\nThanks!`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                className="resize-none"
              />
            </div>
            <Button
              onClick={handleExtract}
              disabled={loading || !text.trim()}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" />
                  Extract Lead Data
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Extracted Data</CardTitle>
              {result && getConfidenceBadge(result.confidence)}
            </div>
            <CardDescription>
              {result
                ? 'Review the extracted information before creating a lead'
                : 'Extracted lead details will appear here'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!result && !loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <UserPlus className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No data extracted yet</p>
                <p className="text-xs mt-1">Paste text and click Extract to begin</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Analyzing text with AI...</p>
              </div>
            )}

            {result && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  {fields.map(
                    (field) =>
                      field.value && (
                        <div
                          key={field.label}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                              {field.label}
                            </p>
                            <p className="text-sm font-semibold mt-0.5">{field.value}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              navigator.clipboard.writeText(field.value || '');
                              toast.success(`${field.label} copied`);
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ),
                  )}
                </div>

                <Separator />

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setResult(null);
                      setText('');
                    }}
                  >
                    Clear
                  </Button>
                  <Button className="flex-1 gap-2" onClick={handleCreateLead} disabled={isCreating}>
                    {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isCreating ? 'Creating...' : 'Create Lead'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
