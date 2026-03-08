'use client';

import * as React from 'react';
import { Upload, File, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'uploading' | 'complete' | 'error';
  error?: string;
}

interface FileUploadProps {
  accept?: string;
  maxSize?: number;
  multiple?: boolean;
  files?: UploadedFile[];
  onFilesSelected?: (files: FileList) => void;
  onRemoveFile?: (fileId: string) => void;
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function FileUpload({
  accept,
  maxSize,
  multiple = true,
  files = [],
  onFilesSelected,
  onRemoveFile,
  className,
}: FileUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      onFilesSelected?.(e.dataTransfer.files);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-[var(--radius-card)] border-2 border-dashed p-8 cursor-pointer transition-all duration-200',
          isDragging
            ? 'border-primary-500 bg-primary-50/50 scale-[1.01] dark:bg-primary-950/20'
            : 'border-[var(--color-border-default)] hover:border-primary-300 hover:bg-[var(--color-bg-muted)]/50',
          'focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2',
        )}
        aria-label="Drag and drop file upload area"
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => e.target.files && onFilesSelected?.(e.target.files)}
        />
        <div className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-muted)] mb-3 transition-all',
          isDragging && 'bg-primary-100 animate-bounce dark:bg-primary-900/30',
        )}>
          <Upload className={cn('h-[var(--icon-md)] w-[var(--icon-md)] text-[var(--color-text-muted)]', isDragging && 'text-primary-500')} />
        </div>
        <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
          {isDragging ? 'Drop files here' : 'Click to upload or drag & drop'}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {accept ? `Accepted: ${accept}` : 'Any file type'}
          {maxSize && ` (max ${formatFileSize(maxSize)})`}
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-card)] p-3 animate-slide-up"
              style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}
            >
              <div className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                file.status === 'complete' && 'bg-[var(--color-success-bg)] text-[var(--color-success-text)]',
                file.status === 'error' && 'bg-[var(--color-error-bg)] text-[var(--color-error-text)]',
                file.status === 'uploading' && 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]',
              )}>
                {file.status === 'complete' ? <CheckCircle2 className="h-[var(--icon-sm)] w-[var(--icon-sm)]" /> : file.status === 'error' ? <AlertCircle className="h-[var(--icon-sm)] w-[var(--icon-sm)]" /> : <File className="h-[var(--icon-sm)] w-[var(--icon-sm)]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{file.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatFileSize(file.size)}
                  {file.error && <span className="text-error ml-2">{file.error}</span>}
                </p>
                {file.status === 'uploading' && (
                  <Progress value={file.progress} className="h-1.5 mt-1.5" />
                )}
              </div>
              {onRemoveFile && (
                <Button variant="ghost" size="icon-sm" onClick={() => onRemoveFile(file.id)} className="shrink-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
