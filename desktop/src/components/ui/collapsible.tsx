'use client';

import * as React from 'react';
import { Collapsible as RadixCollapsible } from 'radix-ui';
import { cn } from '@/lib/utils';

const Collapsible = RadixCollapsible.Root;
const CollapsibleTrigger = RadixCollapsible.Trigger;

const CollapsibleContent = React.forwardRef<
  React.ComponentRef<typeof RadixCollapsible.Content>,
  React.ComponentPropsWithoutRef<typeof RadixCollapsible.Content>
>(({ className, ...props }, ref) => (
  <RadixCollapsible.Content
    ref={ref}
    className={cn(
      'overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
      className,
    )}
    {...props}
  />
));
CollapsibleContent.displayName = 'CollapsibleContent';

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
