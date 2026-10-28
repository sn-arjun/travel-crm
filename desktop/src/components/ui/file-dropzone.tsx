'use client';

import { FileUp, X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

import { Button } from './button';

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  /** Comma-separated accept string, e.g. '.csv,image/*'. */
  accept?: string;
  multiple?: boolean;
  /** Max size per file, in bytes. Oversized files are rejected with an error. */
  maxSize?: number;
  disabled?: boolean;
  /** Files currently staged, rendered as a removable list. */
  files?: File[];
  onRemove?: (index: number) => void;
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  maxSize,
  disabled,
  files = [],
  onRemove,
  label,
  hint,
  error,
  className,
}: FileDropzoneProps) {
  const t = useT();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const accept_ = accept;
  const shownError = error ?? localError;

  const handleFiles = React.useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      const incoming = Array.from(list);

      if (maxSize) {
        const tooBig = incoming.find((f) => f.size > maxSize);
        if (tooBig) {
          setLocalError(t('ui.fileDropzone.tooBig', { name: tooBig.name, limit: formatBytes(maxSize) }));
          return;
        }
      }

      setLocalError(null);
      onFiles(multiple ? incoming : incoming.slice(0, 1));
    },
    [maxSize, multiple, onFiles, t],
  );

  return (
    <div className={cn('space-y-ds-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-describedby={shownError ? 'dropzone-error' : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-ds-2 rounded-ds-lg border-2 border-dashed p-ds-6 text-center transition-colors',
          'focus-visible:ring-2 focus-visible:ring-ds-ring focus-visible:outline-none',
          dragging
            ? 'border-ds-primary bg-ds-primary-subtle'
            : 'border-ds-border bg-ds-surface-sunken hover:border-ds-border-strong',
          disabled && 'cursor-not-allowed opacity-50',
          shownError && 'border-ds-danger',
        )}
      >
        <FileUp className="size-6 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm font-medium text-ds-foreground">{label ?? t('ui.fileDropzone.label')}</p>
        {hint && <p className="text-xs text-ds-foreground-muted">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept_}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
          className="sr-only"
        />
      </div>

      {shownError && (
        <p id="dropzone-error" role="alert" className="text-xs text-ds-danger">
          {shownError}
        </p>
      )}

      {files.length > 0 && (
        <ul className="space-y-ds-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between gap-ds-2 rounded-ds-md border border-ds-border bg-ds-surface px-ds-3 py-ds-2"
            >
              <span className="truncate text-sm text-ds-foreground">{file.name}</span>
              <span className="flex shrink-0 items-center gap-ds-2">
                <span className="text-xs tabular-nums text-ds-foreground-muted">
                  {formatBytes(file.size)}
                </span>
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(i)}
                    aria-label={t('ui.fileDropzone.remove', { name: file.name })}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
