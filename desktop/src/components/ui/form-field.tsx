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
          {required && <span className="text-ds-danger ms-0.5">*</span>}
        </Label>
      )}
      {description && (
        <p className="text-xs text-ds-foreground-muted">{description}</p>
      )}
      {children}
      {error && (
        <p className="text-xs text-ds-danger animate-slide-in-from-top" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { FormField };
