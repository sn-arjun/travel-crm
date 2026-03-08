'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, FileText, Copy, Eye, Plus, MapPin, Calendar, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { client, type ApiResponse, type PaginatedResponse } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';
import { itinerariesApi } from '@/lib/api/itineraries';
import { toast } from 'sonner';

interface ItineraryTemplate {
  id: string;
  title: string;
  description?: string;
  destination?: string;
  duration?: number;
  budget?: number;
  category?: string;
  items?: any[];
  createdAt: string;
  updatedAt: string;
}

export default function ItineraryTemplatesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [selectedTemplate, setSelectedTemplate] = React.useState<ItineraryTemplate | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');

  const { data: response, loading, error } = useApiQuery(
    () => client.get<ApiResponse<PaginatedResponse<ItineraryTemplate>>>(API_ENDPOINTS.itineraryTemplates.list, {
      params: { page: 1, limit: 100 },
    }),
    [],
  );

  const { mutate: createFromTemplate, loading: isCreating } = useApiMutation<{ templateId: string; title: string }, any>(
    (data) => client.post<ApiResponse<any>>(API_ENDPOINTS.itineraryTemplates.createFrom, data),
  );

  const templates: ItineraryTemplate[] = React.useMemo(() => {
    if (!response?.data) return [];
    const data = response.data;
    return Array.isArray(data) ? data : (data as any)?.data ?? [];
  }, [response]);

  const filtered = React.useMemo(() => {
    if (!search) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.destination?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    );
  }, [templates, search]);

  async function handleCreateFromTemplate() {
    if (!selectedTemplate || !newTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }

    const result = await createFromTemplate({
      templateId: selectedTemplate.id,
      title: newTitle,
    });

    if (result) {
      toast.success('Itinerary created from template');
      const data = (result as any)?.data;
      if (data?.id) {
        router.push(`/itineraries/${data.id}`);
      } else {
        router.push('/itineraries');
      }
    } else {
      toast.error('Failed to create itinerary');
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Itinerary Templates
            </h1>
            <p className="text-sm text-muted-foreground">{templates.length} templates available</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">{search ? 'No templates match your search' : 'No templates available'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm font-semibold line-clamp-1">{template.title}</CardTitle>
                    {template.category && (
                      <Badge variant="outline" className="text-xs capitalize shrink-0 ml-2">{template.category}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {template.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{template.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {template.destination && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{template.destination}</span>
                    )}
                    {template.duration && (
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{template.duration} days</span>
                    )}
                    {template.budget && (
                      <span className="font-mono">₹{(template.budget / 1000).toFixed(0)}K</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setNewTitle(`${template.title} - Copy`);
                        setIsCreateDialogOpen(true);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1" /> Use Template
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTemplate(template)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      {selectedTemplate && !isCreateDialogOpen && (
        <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedTemplate.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedTemplate.description && (
                <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Destination:</span>
                  <p className="font-medium">{selectedTemplate.destination || '--'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>
                  <p className="font-medium">{selectedTemplate.duration ? `${selectedTemplate.duration} days` : '--'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Budget:</span>
                  <p className="font-medium">{selectedTemplate.budget ? `₹${selectedTemplate.budget.toLocaleString('en-IN')}` : '--'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Items:</span>
                  <p className="font-medium">{selectedTemplate.items?.length ?? 0} day items</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>Close</Button>
              <Button onClick={() => {
                setNewTitle(`${selectedTemplate.title} - Copy`);
                setIsCreateDialogOpen(true);
              }}>
                <Copy className="h-4 w-4 mr-1.5" /> Use This Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create from Template Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Itinerary from Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Creating from: <strong>{selectedTemplate?.title}</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="newTitle">Itinerary Title *</Label>
              <Input
                id="newTitle"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter title for the new itinerary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreating}>Cancel</Button>
            <Button onClick={handleCreateFromTemplate} disabled={isCreating}>
              {isCreating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Itinerary
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
