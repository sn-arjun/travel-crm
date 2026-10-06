'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Loader2, Map, Save, Clock, MapPin, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { AiUnavailableNotice } from '@/components/domain/ai/ai-unavailable-notice';
import { CurrencyInput } from '@/components/ui/currency-input';
import { aiApi, isAiUnavailableError, type AiUnavailableError, type GeneratedItinerary } from '@/lib/api/ai';
import { itinerariesApi } from '@/lib/api/itineraries';
import { leadsApi } from '@/lib/api/leads';
import type { Lead } from '@travelcrm/shared';
import { PageHeader } from '@/components/ui/page-header';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { AiQuotaBadge } from '@/components/domain/ai/quota-badge';
import { GeneratedContentActions } from '@/components/domain/ai/generated-content-actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RelationCombobox } from '@/components/domain/relation-combobox';

export default function ItineraryPage() {
  const router = useRouter();
  const [destination, setDestination] = React.useState('');
  const [duration, setDuration] = React.useState('7');
  const [budget, setBudget] = React.useState<number | undefined>(undefined);
  const [aiError, setAiError] = React.useState<AiUnavailableError | null>(null);
  const [preferences, setPreferences] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [itinerary, setItinerary] = React.useState<GeneratedItinerary | null>(null);
  const [contentId, setContentId] = React.useState<string | undefined>();

  const handleGenerate = async () => {
    if (!destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }

    setLoading(true);
    setItinerary(null);
    setContentId(undefined);
    setAiError(null);

    try {
      const trimmedDuration = parseInt(duration, 10);
      const prompt = `Plan a ${trimmedDuration}-day trip to ${destination.trim()}${budget ? ` with a budget of ${budget}` : ''}${preferences.trim() ? `, focused on ${preferences.trim()}` : ''}.`;
      const response = await aiApi.generateItinerary({
        prompt,
        destination: destination.trim(),
        duration: trimmedDuration,
        budget,
        preferences: preferences
          ? preferences.split(',').map((p) => p.trim()).filter(Boolean)
          : undefined,
      });
      setItinerary(response.data);
      const returnedId = (response.data as GeneratedItinerary & { contentId?: string }).contentId;
      if (returnedId) setContentId(returnedId);
      toast.success('Itinerary generated successfully');
    } catch (err) {
      if (isAiUnavailableError(err)) {
        setAiError(err);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to generate itinerary';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const [isSaving, setIsSaving] = React.useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [saveLeadId, setSaveLeadId] = React.useState<string | null>(null);

  const handleSaveConfirm = async () => {
    if (!itinerary || !saveLeadId) {
      toast.error('Please pick a lead to attach this itinerary to');
      return;
    }
    setIsSaving(true);
    try {
      const days = (itinerary.items || []).map((item, idx: number) => ({
        dayNumber: idx + 1,
        title: item.title || `Day ${idx + 1}`,
        description: item.description || '',
        items: [{
          type: 'activity' as const,
          title: item.title || `Activity`,
          description: item.description || '',
          costPrice: 0,
          sellingPrice: 0,
        }],
      }));
      const response = await itinerariesApi.create({
        leadId: saveLeadId,
        title: itinerary.title || `${destination.trim()} Itinerary`,
        notes: itinerary.description,
        days: days.length > 0 ? days : [{ dayNumber: 1, title: 'Day 1', items: [] }],
      });
      if (response?.data?.id) {
        toast.success('Itinerary saved successfully');
        setSaveDialogOpen(false);
        router.push(`/itineraries/${response.data.id}`);
      } else {
        throw new Error('Failed to save itinerary');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save itinerary';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="AI Itinerary Generator"
        description="Generate detailed day-by-day travel itineraries with AI"
        actions={<AiQuotaBadge capKey="ai_requests" />}
      />

      <AiGate>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Trip Details
            </CardTitle>
            <CardDescription>Provide trip parameters for AI generation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="destination">Destination *</Label>
              <Input
                id="destination"
                placeholder="e.g., Bali, Indonesia"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (days)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                max="30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget">Budget (INR)</Label>
              <CurrencyInput
                id="budget"
                placeholder="e.g., 150,000"
                value={budget}
                onChange={setBudget}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferences">Interests (comma-separated)</Label>
              <Input
                id="preferences"
                placeholder="e.g., culture, beaches, food"
                value={preferences}
                onChange={(e) => setPreferences(e.target.value)}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !destination.trim()}
              className="w-full gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Map className="h-4 w-4" />
                  Generate Itinerary
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">
                  {itinerary ? itinerary.title : 'Generated Itinerary'}
                </CardTitle>
                <CardDescription>
                  {itinerary
                    ? itinerary.description
                    : 'Your AI-generated itinerary will appear here'}
                </CardDescription>
              </div>
              {itinerary && (
                <Button onClick={() => setSaveDialogOpen(true)} variant="outline" className="gap-2" disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {aiError && !loading && <AiUnavailableNotice error={aiError} onRetry={handleGenerate} />}

            {!itinerary && !loading && !aiError && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Map className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">No itinerary generated yet</p>
                <p className="text-xs mt-1">Fill in trip details and click Generate</p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Crafting your perfect itinerary...</p>
              </div>
            )}

            {itinerary && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {itinerary.destination}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {itinerary.duration ?? itinerary.items.length} days
                  </div>
                </div>

                <Separator />

                {(!itinerary.items || itinerary.items.length === 0) && (
                  <p className="text-sm text-muted-foreground">
                    {(itinerary as { note?: string }).note || 'No day-by-day details were returned for this itinerary.'}
                  </p>
                )}

                <div className="space-y-4">
                  {(itinerary.items || []).map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                          {item.day}
                        </div>
                        {idx < itinerary.items.length - 1 && (
                          <div className="w-px flex-1 bg-border mt-1" />
                        )}
                      </div>
                      <div className="pb-4 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.title}</p>
                          {item.time && (
                            <Badge variant="outline" className="text-xs">
                              {item.time}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        {item.location && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.location}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <GeneratedContentActions contentId={contentId} className="mt-4" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Itinerary</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lead</Label>
              <RelationCombobox<Lead>
                value={saveLeadId}
                onChange={(id) => setSaveLeadId(id)}
                fetcher={async (query, page) => {
                  const res = await leadsApi.list({ search: query, page, limit: 20 });
                  const payload = res as unknown as { data: Lead[]; pagination?: { total: number } };
                  const items = payload.data ?? [];
                  const total = payload.pagination?.total ?? items.length;
                  return { items, total };
                }}
                getOptionId={(l) => l.id}
                getOptionLabel={(l) => l.title}
                resolveSelected={async (id) => (await leadsApi.getById(id)).data}
                placeholder="Search leads…"
                searchPlaceholder="Search by lead title…"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSaveConfirm} disabled={isSaving || !saveLeadId} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </AiGate>
    </PageContainer>
  );
}
