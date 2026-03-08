'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onCallStart?.(phoneNumber);
    router.push(`/communication/calls/dial?phone=${encodeURIComponent(phoneNumber)}`);
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

            className={cn(sizeClasses[size], 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30', className)}
          >
            <Phone className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
            <span className="sr-only">Call {contactName || phoneNumber}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {phoneNumber}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
