import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

interface FormFieldProps {
  label?: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

function FormField({ label, description, error, required, className, children, htmlFor }: FormFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </Label>
      )}
      {description && (
        <p className="text-xs text-[var(--color-text-muted)]">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-xs text-error animate-slide-in-from-top" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { FormField };
