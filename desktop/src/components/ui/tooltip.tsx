'use client';

import * as React from 'react';
import { Tooltip as RadixTooltip } from 'radix-ui';
import { cn } from '@/lib/utils';

const TooltipProvider = RadixTooltip.Provider;
const Tooltip = RadixTooltip.Root;
const TooltipTrigger = RadixTooltip.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof RadixTooltip.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTooltip.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-(--ds-z-tooltip) overflow-hidden rounded-ds-md bg-ds-foreground px-3 py-1.5 text-xs text-ds-background shadow-ds-2',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </RadixTooltip.Portal>
));
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
