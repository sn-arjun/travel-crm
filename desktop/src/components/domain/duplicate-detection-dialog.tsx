'use client';

import * as React from 'react';
import { AlertCircle, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  createdAt: string;
}

export interface DuplicateContactPair {
  original: Contact;
  potential: Contact;
  matchScore: number;
  matchingFields: ('name' | 'email' | 'phone')[];
}

interface DuplicateDetectionDialogProps {
  isOpen: boolean;
  duplicates: DuplicateContactPair[];
  onMerge: (original: Contact, duplicate: Contact) => void;
  onKeepBoth: (contact: Contact) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

function getMatchIcon(field: string) {
  return <Check className="h-4 w-4 text-green-600" />;
}

export function DuplicateDetectionDialog({
  isOpen,
  duplicates,
  onMerge,
  onKeepBoth,
  onSkip,
  isLoading = false,
}: DuplicateDetectionDialogProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [mergePreview, setMergePreview] = React.useState<Contact | null>(null);

  const current = duplicates[currentIndex];

  const handleMerge = () => {
    if (current) {
      onMerge(current.original, current.potential);
      if (currentIndex < duplicates.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }
  };

  const handleKeepBoth = () => {
    if (current) {
      onKeepBoth(current.potential);
      if (currentIndex < duplicates.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  React.useEffect(() => {
    if (current) {
      // Create merged preview
      const merged: Contact = {
        ...current.original,
        email: current.original.email || current.potential.email,
        phone: current.original.phone || current.potential.phone,
        company: current.original.company || current.potential.company,
      };
      setMergePreview(merged);
    }
  }, [current]);

  if (!current) {
    return null;
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            Duplicate Contact Detected
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Contact {currentIndex + 1} of {duplicates.length}
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {/* Match Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Match Score</h3>
              <span className="text-2xl font-bold text-orange-600">{current.matchScore}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-600"
                style={{ width: `${current.matchScore}%` }}
              />
            </div>
          </div>

          {/* Matching Fields */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Matching Criteria</h3>
            <div className="flex flex-wrap gap-2">
              {current.matchingFields.map((field: any) => (
                <Badge key={field} variant="secondary" className="flex items-center gap-2">
                  {getMatchIcon(field)}
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Contacts Comparison */}
          <div>
            <h3 className="font-semibold text-sm mb-3">Review Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Original Contact */}
              <Card className="border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-600" />
                    Current Contact (Keep)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{current.original.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-mono text-xs">{current.original.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-mono text-xs">{current.original.phone || '—'}</p>
                  </div>
                  {current.original.company && (
                    <div>
                      <p className="text-muted-foreground text-xs">Company</p>
                      <p className="text-xs">{current.original.company}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">Added</p>
                    <p className="text-xs">{new Date(current.original.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Duplicate Contact */}
              <Card className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-600" />
                    Potential Duplicate
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Name</p>
                    <p className="font-medium">{current.potential.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-mono text-xs">{current.potential.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-mono text-xs">{current.potential.phone || '—'}</p>
                  </div>
                  {current.potential.company && (
                    <div>
                      <p className="text-muted-foreground text-xs">Company</p>
                      <p className="text-xs">{current.potential.company}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground text-xs">Added</p>
                    <p className="text-xs">{new Date(current.potential.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator />

          {/* Merge Preview */}
          {mergePreview && (
            <div>
              <h3 className="font-semibold text-sm mb-3">Merge Preview</h3>
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10 dark:border-blue-800">
                <CardContent className="pt-6 space-y-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Merged Name</p>
                    <p className="font-medium">{mergePreview.name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Merged Email</p>
                    <p className="font-mono text-xs">{mergePreview.email || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Merged Phone</p>
                    <p className="font-mono text-xs">{mergePreview.phone || '—'}</p>
                  </div>
                  {mergePreview.company && (
                    <div>
                      <p className="text-muted-foreground text-xs">Merged Company</p>
                      <p className="text-xs">{mergePreview.company}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground mt-2">
                ℹ️ Fields from the current contact will be preserved. Missing data from the duplicate will be filled in.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleSkip}
            disabled={isLoading}
          >
            <X className="h-4 w-4 mr-2" />
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleKeepBoth}
              disabled={isLoading}
            >
              Keep Both
            </Button>
            <Button
              onClick={handleMerge}
              disabled={isLoading}
            >
              Merge Contacts
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
