'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { cn } from '@/lib/utils';

interface ClickToCallButtonProps {
  phoneNumber: string;
  contactName?: string;
  size?: 'sm' | 'default';
  onCallStart?: (phoneNumber: string) => void;
  contactId?: string;
  leadId?: string;
  className?: string;
}

export function ClickToCallButton({
  phoneNumber,
  contactName,
  size = 'default',
  onCallStart,
  contactId,
  leadId,
  className,
}: ClickToCallButtonProps) {
  const router = useRouter();
  const { enabled } = useFeatureGate('voip_calling');

  // Calling is plan-gated: render nothing rather than a button that cannot work.
  if (!enabled) return null;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onCallStart?.(phoneNumber);
    const query = new URLSearchParams({ phone: phoneNumber });
    if (contactId) query.set('contactId', contactId);
    if (leadId) query.set('leadId', leadId);
    router.push(`/communication/calls/dial?${query.toString()}`);
  };

  const sizeClasses = {
    sm: 'h-8 w-8',
    default: 'h-10 w-10',
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={handleClick}
            size="icon"
            variant="ghost"
            aria-label={`Call ${contactName || phoneNumber}`}
            className={cn(sizeClasses[size], 'text-ds-success hover:bg-ds-success-subtle hover:text-ds-success-on-subtle', className)}
          >
            <Phone className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {phoneNumber}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
