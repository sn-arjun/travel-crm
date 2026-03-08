'use client';

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  icon?: React.ElementType;
  validate?: () => boolean | Promise<boolean>;
}

interface MultiStepWizardProps {
  steps: WizardStep[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void | Promise<void>;
  children: React.ReactNode;
  completeBtnLabel?: string;
  isSubmitting?: boolean;
}

export function MultiStepWizard({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  children,
  completeBtnLabel = 'Complete',
  isSubmitting = false,
}: MultiStepWizardProps) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  async function handleNext() {
    const step = steps[currentStep];
    if (step?.validate) {
      const valid = await step.validate();
      if (!valid) return;
    }
    if (isLast) {
      await onComplete();
    } else {
      onStepChange(currentStep + 1);
    }
  }

  function handleBack() {
    if (!isFirst) onStepChange(currentStep - 1);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Step Indicator */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-center gap-2 max-w-2xl mx-auto">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;
            const Icon = step.icon;
            return (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <div className={cn('flex-1 h-0.5 max-w-16', isCompleted ? 'bg-primary' : 'bg-border')} />
                )}
                <button
                  type="button"
                  onClick={() => idx < currentStep && onStepChange(idx)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
                    isCompleted && 'text-primary cursor-pointer',
                    isCurrent && 'bg-primary/10 text-primary font-semibold',
                    !isCompleted && !isCurrent && 'text-muted-foreground cursor-default'
                  )}
                >
                  <div className={cn(
                    'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0',
                    isCompleted ? 'bg-primary border-primary text-primary-foreground' :
                    isCurrent ? 'border-primary text-primary' :
                    'border-muted-foreground/30 text-muted-foreground'
                  )}>
                    {isCompleted ? <Check className="h-3.5 w-3.5" /> : Icon ? <Icon className="h-3.5 w-3.5" /> : idx + 1}
                  </div>
                  <span className="hidden sm:inline">{step.title}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="text-center mt-2">
          <p className="text-xs text-muted-foreground">
            Step {currentStep + 1} of {steps.length}: {steps[currentStep]?.title}
            {steps[currentStep]?.description && ` — ${steps[currentStep]?.description}`}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/30">
        <Button variant="outline" onClick={handleBack} disabled={isFirst}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-1.5">
          {steps.map((_, idx) => (
            <div key={idx} className={cn('h-1.5 w-6 rounded-full transition-colors', idx <= currentStep ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <Button onClick={handleNext} disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : isLast ? null : (
            <></>
          )}
          {isLast ? completeBtnLabel : 'Next'}
          {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
        </Button>
      </div>
    </div>
  );
}

/* ─── WizardStepContent — helper to show/hide step content ─── */
export function WizardStepContent({ stepIndex, currentStep, children }: { stepIndex: number; currentStep: number; children: React.ReactNode }) {
  if (stepIndex !== currentStep) return null;
  return <>{children}</>;
}
