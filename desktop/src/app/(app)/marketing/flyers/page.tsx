'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, Share2, Download, Copy, Edit2, Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { marketingApi } from '@/lib/api/marketing';
import type { FlyerTemplate, MarketingFlyer } from '@/lib/api/marketing';

interface FlyerData {
  templateId: string;
  headline: string;
  subheadline: string;
  offerText: string;
  contactInfo: string;
  colorScheme: string;
  fontSize: 'small' | 'medium' | 'large';
  imageUrl: string | null;
}

const colorSchemes = [
  { id: 'ocean', name: 'Ocean Blue', bg: '#003A8C', text: '#FFFFFF' },
  { id: 'sunset', name: 'Sunset', bg: '#FF6B35', text: '#FFFFFF' },
  { id: 'forest', name: 'Forest Green', bg: '#2D6A4F', text: '#FFFFFF' },
  { id: 'royal', name: 'Royal Purple', bg: '#6F2DA8', text: '#FFFFFF' },
  { id: 'sand', name: 'Sandy Beige', bg: '#D4A373', text: '#1F1F1F' },
  { id: 'coral', name: 'Coral Pink', bg: '#FF7675', text: '#FFFFFF' },
];

const initialFlyerData: FlyerData = {
  templateId: '',
  headline: 'Discover Paradise',
  subheadline: 'Experience the best beach destinations',
  offerText: 'Special Summer Offer: 30% Off',
  contactInfo: '+91-XXXX-XXXX-XX | info@travelcrm.com',
  colorScheme: 'ocean',
  fontSize: 'medium',
  imageUrl: null,
};

function TemplateGallery({ onSelect, templates, loading }: { onSelect: (templateId: string) => void; templates: FlyerTemplate[]; loading: boolean }) {
  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-8 space-y-4">
        <p className="text-muted-foreground">No templates available yet.</p>
        <Button onClick={() => onSelect('blank')}>
          <Palette className="h-4 w-4 mr-2" /> Create from Scratch
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {templates.map((template: any) => (
        <Card
          key={template.id}
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => onSelect(template.id)}
        >
          <CardContent className="pt-6 flex flex-col items-center justify-center min-h-[120px]">
            {template.thumbnailUrl ? (
              <img src={template.thumbnailUrl} alt={template.name} className="w-16 h-16 mb-2 object-cover rounded" />
            ) : (
              <div className="text-5xl mb-2">📄</div>
            )}
            <p className="font-semibold text-sm">{template.name}</p>
            <Badge variant="outline" className="mt-2">{template.category}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FlyerEditor({ data, onUpdate }: { data: FlyerData; onUpdate: (data: FlyerData) => void }) {
  const colorScheme = colorSchemes.find((cs) => cs.id === data.colorScheme) ?? colorSchemes[0]!;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Left: Editor Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Text Content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Headline</label>
                <Input
                  value={data.headline}
                  onChange={(e) => onUpdate({ ...data, headline: e.target.value })}
                  placeholder="Main headline"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Subheadline</label>
                <Input
                  value={data.subheadline}
                  onChange={(e) => onUpdate({ ...data, subheadline: e.target.value })}
                  placeholder="Secondary text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Offer Text</label>
                <Input
                  value={data.offerText}
                  onChange={(e) => onUpdate({ ...data, offerText: e.target.value })}
                  placeholder="Special offer"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Info</label>
                <Input
                  value={data.contactInfo}
                  onChange={(e) => onUpdate({ ...data, contactInfo: e.target.value })}
                  placeholder="Phone or email"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Design</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-2">Color Scheme</label>
                <div className="flex flex-wrap gap-2">
                  {colorSchemes.map((scheme: any) => (
                    <button
                      key={scheme.id}
                      onClick={() => onUpdate({ ...data, colorScheme: scheme.id })}
                      className={cn(
                        'h-8 w-8 rounded-md border-2 transition-all',
                        data.colorScheme === scheme.id ? 'border-gray-900' : 'border-transparent',
                      )}
                      style={{ backgroundColor: scheme.bg }}
                      title={scheme.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">Font Size</label>
                <Select value={data.fontSize} onValueChange={(v) => onUpdate({ ...data, fontSize: v as FlyerData['fontSize'] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2">Upload Image</label>
                <Button variant="outline" size="sm" className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: Preview */}
        <div className="flex items-center justify-center bg-muted rounded-lg p-4 min-h-96">
          <div
            className="w-full max-w-xs rounded-lg p-6 text-center shadow-lg"
            style={{ backgroundColor: colorScheme.bg, color: colorScheme.text }}
          >
            <div style={{
              fontSize: data.fontSize === 'small' ? '18px' : data.fontSize === 'medium' ? '24px' : '32px',
            }}
            >
              <h2 className="font-bold mb-2">{data.headline}</h2>
              <p className="text-sm mb-2 opacity-90">{data.subheadline}</p>
              <div className="border-t border-current opacity-50 my-3" />
              <p className="font-semibold text-base mb-3">{data.offerText}</p>
              <p className="text-xs opacity-75">{data.contactInfo}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FlyersPage() {
  const router = useRouter();
  const [view, setView] = React.useState<'gallery' | 'editor'>('gallery');
  const [flyerData, setFlyerData] = React.useState<FlyerData>(initialFlyerData);
  const [isShareOpen, setIsShareOpen] = React.useState(false);

  const { data: templatesData, loading: templatesLoading } = useApiQuery(
    () => marketingApi.flyerTemplates.list({ limit: 100 }),
    [],
  );

  const { mutate: createFlyer, loading: isCreating } = useApiMutation(marketingApi.flyers.create);
  const { mutate: updateFlyer, loading: isUpdating } = useApiMutation((data: { id: string; update: any }) =>
    marketingApi.flyers.update(data.id, data.update)
  );

  const templates = Array.isArray(templatesData?.data) ? templatesData.data : (templatesData?.data?.data ?? []);

  const handleSelectTemplate = (templateId: string) => {
    setFlyerData((prev) => ({ ...prev, templateId }));
    setView('editor');
  };

  const handleExport = () => {
    toast.success(`Flyer exported: ${flyerData.headline}`);
  };

  const handleSaveDraft = async () => {
    if (!flyerData.headline.trim()) {
      toast.error('Please enter a headline');
      return;
    }

    const result = await createFlyer({
      templateId: flyerData.templateId,
      title: flyerData.headline,
      content: {
        subheadline: flyerData.subheadline,
        offerText: flyerData.offerText,
        contactInfo: flyerData.contactInfo,
        colorScheme: flyerData.colorScheme,
        fontSize: flyerData.fontSize,
      },
      imageUrl: flyerData.imageUrl ?? undefined,
    });

    if (result) {
      toast.success('Flyer saved as draft');
    } else {
      toast.error('Failed to save flyer');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Flyer Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            {view === 'gallery' ? 'Select a template to get started' : 'Customize your flyer'}
          </p>
        </div>
        {view === 'editor' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSaveDraft}>
              Save Draft
            </Button>
            <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share Flyer</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Share Link</label>
                    <div className="flex gap-2">
                      <Input value="https://share.travelcrm.io/flyer/abc123" readOnly />
                      <Button size="sm" variant="outline">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this link with colleagues or clients</p>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView('gallery')}
            >
              Back to Gallery
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          {view === 'gallery' ? (
            <TemplateGallery onSelect={handleSelectTemplate} templates={templates} loading={templatesLoading} />
          ) : (
            <FlyerEditor data={flyerData} onUpdate={setFlyerData} />
          )}
        </div>
      </div>
    </div>
  );
}
