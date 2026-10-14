'use client';

import * as React from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { client } from '@/lib/api/client';
import { getApiBaseUrl, API_ENDPOINTS } from '@/lib/api/config';
import { unwrapEntity } from '@/lib/api/envelope';

export interface DayImage {
  key: string;
  url: string;
  name: string;
}

interface UploadedFile {
  key: string;
  url: string;
  name: string;
}

/** Image already stored on the server, addressed by its storage key. */
export function imageFromKey(key: string): DayImage {
  const url = /^https?:\/\//.test(key) ? key : `${getApiBaseUrl()}${API_ENDPOINTS.files.get(key)}`;
  return { key, url, name: key.split('/').pop() ?? key };
}

/** Uploads one image; resolves null when the server returned no key. */
export async function uploadDayImage(file: File): Promise<DayImage | null> {
  const formData = new FormData();
  formData.append('file', file);
  const uploaded = unwrapEntity<UploadedFile>(await client.post<unknown>(API_ENDPOINTS.files.upload, formData));
  return uploaded?.key ? { key: uploaded.key, url: uploaded.url, name: uploaded.name } : null;
}

interface DayImageUploaderProps {
  images: DayImage[];
  onUpload: (files: FileList) => void;
  onRemove: (imgIndex: number) => void;
}

export function DayImageUploader({ images, onUpload, onRemove }: DayImageUploaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-ds-2">
      <div className="flex items-center gap-ds-2">
        <Label className="text-xs">Images</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Upload day images"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUpload(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-ds-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="size-3" aria-hidden="true" /> Add Images
        </Button>
      </div>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-ds-2">
          {images.map((img, imgIdx) => (
            <div key={img.key} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.name} className="size-20 object-cover rounded-md border border-ds-border" />
              <button
                type="button"
                aria-label={`Remove ${img.name}`}
                onClick={() => onRemove(imgIdx)}
                className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-ds-danger text-ds-danger-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
