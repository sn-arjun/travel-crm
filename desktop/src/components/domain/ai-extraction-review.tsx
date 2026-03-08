'use client';

import * as React from 'react';
import { Check, AlertCircle, Edit2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ExtractedField {
  name: string;
  value: string;
  confidence: number;
}

interface AIExtractionReviewProps {
  type: 'call' | 'document';
  sourceId: string;
  onConfirm?: (data: Record<string, string>) => void;
}

export function AIExtractionReview({ type, sourceId, onConfirm }: AIExtractionReviewProps) {
  const [fields, setFields] = React.useState<ExtractedField[]>(() => {
    if (type === 'call') {
      return [
        { name: 'Customer Name', value: 'Amit Kumar', confidence: 98 },
        { name: 'Destination', value: 'Bali', confidence: 95 },
        { name: 'Travel Dates', value: '15 May - 22 May 2026', confidence: 87 },
        { name: 'Budget', value: '150,000 INR', confidence: 72 },
        { name: 'Pax Count', value: '4 (2 adults, 2 children)', confidence: 90 },
        { name: 'Special Requirements', value: 'Family-friendly, beach resort', confidence: 65 },
      ];
    } else {
      return [
        { name: 'Customer Name', value: 'Priya Sharma', confidence: 99 },
        { name: 'Document Type', value: 'Passport', confidence: 96 },
        { name: 'Passport Number', value: 'N5482938', confidence: 92 },
        { name: 'Date of Birth', value: '10 March 1985', confidence: 88 },
        { name: 'Expiry Date', value: '15 August 2030', confidence: 94 },
        { name: 'Nationality', value: 'Indian', confidence: 97 },
      ];
    }
  });

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');

  const handleEditStart = (field: ExtractedField) => {
    setEditingId(field.name);
    setEditValue(field.value);
  };

  const handleEditSave = (fieldName: string) => {
    setFields((prev) =>
      prev.map((f: any) =>
        f.name === fieldName ? { ...f, value: editValue, confidence: Math.max(f.confidence - 5, 50) } : f,
      ),
    );
    setEditingId(null);
  };

  const handleConfirm = () => {
    const data: Record<string, string> = {};
    fields.forEach((f) => {
      data[f.name.toLowerCase().replace(/\s+/g, '_')] = f.value;
    });
    onConfirm?.(data);
    toast.success(`Lead created from ${type} data`);
  };

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400';
    if (confidence >= 80) return 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400';
    if (confidence >= 70) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400';
    return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400';
  };

  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 80) return <Check className="h-3 w-3" />;
    return <AlertCircle className="h-3 w-3" />;
  };

  const avgConfidence = Math.round(fields.reduce((sum: any, f: any) => sum + f.confidence, 0) / fields.length);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg capitalize">
              {type === 'call' ? 'Call' : 'Document'} Extraction Review
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{sourceId}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-foreground">{avgConfidence}%</p>
            <p className="text-xs text-muted-foreground">Average confidence</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Fields */}
        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">{field.name}</label>
                <Badge variant="outline" className={cn('text-xs font-semibold gap-1 px-1.5 py-0.5', getConfidenceBadgeColor(field.confidence))}>
                  {getConfidenceIcon(field.confidence)}
                  {field.confidence}%
                </Badge>
              </div>

              {editingId === field.name ? (
                <div className="flex gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.currentTarget.value)}
                    className="text-sm"
                    autoFocus
                  />
                  <Button
                    onClick={() => handleEditSave(field.name)}
                    size="sm"
                    variant="outline"
                    className="px-3"
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                  <p className="text-sm text-foreground flex-1">{field.value}</p>
                  <Button
                    onClick={() => handleEditStart(field)}
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 hover:bg-muted"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Edit</span>
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info Box */}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 border border-blue-200/50 dark:border-blue-800/30">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Review the extracted data above. Edit any fields if needed. Low confidence fields are marked with a warning icon.
          </p>
        </div>

        {/* Action Button */}
        <Button onClick={handleConfirm} className="w-full gap-2">
          <Check className="h-4 w-4" />
          {type === 'call' ? 'Confirm & Create Lead' : 'Confirm & Create Supplier Invoice'}
        </Button>
      </CardContent>
    </Card>
  );
}
