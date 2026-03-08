'use client';

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
import { aiApi, type GeneratedItinerary } from '@/lib/api/ai';
import { itinerariesApi } from '@/lib/api/itineraries';

export default function ItineraryPage() {
  const router = useRouter();
  const [destination, setDestination] = React.useState('');
  const [duration, setDuration] = React.useState('7');
  const [budget, setBudget] = React.useState('');
  const [preferences, setPreferences] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [itinerary, setItinerary] = React.useState<GeneratedItinerary | null>(null);

  const handleGenerate = async () => {
    if (!destination.trim()) {
      toast.error('Please enter a destination');
      return;
    }

    setLoading(true);
    setItinerary(null);

    try {
      const response = await aiApi.generateItinerary({
        destination: destination.trim(),
        duration: parseInt(duration, 10),
        budget: budget ? parseFloat(budget) : undefined,
        preferences: preferences
          ? preferences.split(',').map((p) => p.trim()).filter(Boolean)
          : undefined,
      });
      setItinerary(response.data);
      toast.success('Itinerary generated successfully');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate itinerary';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    if (!itinerary) return;
    setIsSaving(true);
    try {
      const days = (itinerary.items || []).map((item: any, idx: number) => ({
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
        leadId: '' as any, // AI-generated itineraries may not have a lead yet
        title: itinerary.title,
        notes: itinerary.description,
        days: days.length > 0 ? days : [{ dayNumber: 1, title: 'Day 1', items: [] }],
      });
      if (response?.data?.id) {
        toast.success('Itinerary saved successfully');
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI Itinerary Generator</h1>
        <p className="text-muted-foreground mt-1">
          Generate detailed day-by-day travel itineraries with AI
        </p>
      </div>

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
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input
                id="budget"
                type="number"
                placeholder="e.g., 5000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
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
                <Button onClick={handleSave} variant="outline" className="gap-2" disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!itinerary && !loading && (
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
                    {itinerary.startDate} to {itinerary.endDate}
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  {itinerary.items.map((item, idx) => (
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
