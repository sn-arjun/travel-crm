import * as React from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

function EmptyState({ className, icon, title, description, action, ...props }: EmptyStateProps) {
  return (
    <div
      role="region"
      className={cn(
        'flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-4 rounded-full bg-ds-surface-sunken p-4 text-ds-foreground-muted">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-ds-foreground mb-1 animate-slide-up">{title}</h3>
      {description && (
        <p className="text-sm text-ds-foreground-muted max-w-sm mb-4 animate-slide-up" style={{ animationDelay: '50ms' }}>
          {description}
        </p>
      )}
      {action && <div className="animate-slide-up" style={{ animationDelay: '100ms' }}>{action}</div>}
    </div>
  );
}

export { EmptyState };
