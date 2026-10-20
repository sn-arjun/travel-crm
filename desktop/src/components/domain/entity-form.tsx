'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import {
  FormProvider,
  get,
  useForm,
  useFormContext,
  type DefaultValues,
  type FieldErrors,
  type FieldValues,
  type Path,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import type { ZodType } from 'zod';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Spinner } from '@/components/ui/spinner';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { PageContainer } from '@/components/layout/page-container';
import type { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';

export interface FormSection {
  title: string;
  description?: string;
  /** Marks the whole section as containing required fields. */
  required?: boolean;
  children: React.ReactNode;
}

export interface EntityFormProps<T extends FieldValues> {
  title: string;
  description?: string;

  schema: ZodType<T>;
  defaultValues: DefaultValues<T>;
  onSubmit: SubmitHandler<T>;
  onCancel?: () => void;

  /**
   * Maps URL search params onto form fields so cross-entity navigation
   * carries context — e.g. `/leads/new?contactId=abc` prefills the contact.
   * Keys are param names; values are the form field paths they populate.
   */
  prefillFromParams?: Partial<Record<string, Path<T>>>;

  /** Sections rendered in order. Use `renderSections` for field-level access. */
  sections?: FormSection[];
  /** Receives the form instance — use when fields need `control`/`register`. */
  renderSections?: (form: UseFormReturn<T>) => React.ReactNode;

  submitLabel?: string;
  cancelLabel?: string;
  /** Disables the whole form, e.g. while the entity is still loading. */
  loading?: boolean;
  /** Server-side error shown above the actions. */
  error?: string;
  className?: string;
}

/**
 * The form archetype: RHF + Zod, sectioned layout, sticky header actions,
 * unsaved-changes guard, and URL-param prefill.
 */
export function EntityForm<T extends FieldValues>({
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  onCancel,
  prefillFromParams,
  sections,
  renderSections,
  submitLabel: submitLabelProp,
  cancelLabel: cancelLabelProp,
  loading,
  error,
  className,
}: EntityFormProps<T>) {
  const t = useT();
  const submitLabel = submitLabelProp ?? t('common.save');
  const cancelLabel = cancelLabelProp ?? t('common.cancel');
  const searchParams = useSearchParams();

  // Fold URL params into the initial values so prefill happens before first
  // render — resetting after mount would fight the user's own edits.
  const initialValues = React.useMemo(() => {
    if (!prefillFromParams || !searchParams) return defaultValues;
    const merged = { ...defaultValues } as Record<string, unknown>;
    for (const [param, field] of Object.entries(prefillFromParams)) {
      if (!field) continue;
      const raw = searchParams.get(param);
      if (raw !== null && raw !== '') merged[field as string] = raw;
    }
    return merged as DefaultValues<T>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, prefillFromParams]);

  const form = useForm<T>({
    // Cast is required: zodResolver's generics don't align with RHF's
    // TFieldValues when the schema is passed in generically.
    resolver: zodResolver(schema as never) as never,
    defaultValues: initialValues,
    mode: 'onBlur',
    // Once a field has been flagged, re-check it on every change so the error
    // clears the moment the value becomes valid.
    reValidateMode: 'onChange',
  });

  const {
    formState: { isDirty, isSubmitting, isSubmitted, errors },
  } = form;

  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // setValue defaults: programmatic changes (Combobox, DatePicker, ...) mark the
  // field dirty/touched, and re-validate when the form was already submitted or
  // the field currently shows an error - otherwise stale errors would linger.
  const formWithDefaults = React.useMemo<UseFormReturn<T>>(() => {
    const setValue: UseFormReturn<T>['setValue'] = (name, value, opts) =>
      form.setValue(name, value, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: isSubmitted || !!get(errors, name),
        ...opts,
      });
    return { ...form, setValue };
    // `form` is a stable object; the formState subscriptions above drive refreshes.
  }, [form, isSubmitted, errors]);

  const onValid = async (values: T) => {
    setSubmitError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      const err = (e ?? {}) as Partial<ApiError>;
      for (const [field, msgs] of Object.entries(err.errors ?? {})) {
        const message = Array.isArray(msgs) ? msgs[0] : String(msgs);
        if (message) form.setError(field as Path<T>, { type: 'server', message });
      }
      const msg = err.message || 'Could not save. Please try again.';
      setSubmitError(msg);
      toast.error(msg);
    }
  };

  const onInvalid = (invalid: FieldErrors<T>) => {
    toast.error(t('ui.entityForm.fixFields'));
    const first = Object.keys(invalid)[0];
    if (first) {
      form.setFocus(first as Path<T>);
      document.getElementById(first)?.scrollIntoView?.({ block: 'center' });
    }
  };

  useUnsavedChanges(isDirty && !isSubmitting);

  const busy = loading || isSubmitting;

  return (
    <FormProvider {...formWithDefaults}>
      <PageContainer width="narrow">
      <form onSubmit={form.handleSubmit(onValid, onInvalid)} className={cn('flex flex-col gap-ds-4', className)}>
        <PageHeader
          title={title}
          description={description}
          sticky
          actions={
            <>
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                  {cancelLabel}
                </Button>
              )}
              <Button type="submit" disabled={busy} className="gap-ds-2">
                {isSubmitting && <Spinner className="size-4" />}
                {submitLabel}
              </Button>
            </>
          }
        />

        <fieldset disabled={busy} className="flex flex-col gap-ds-4 border-0 p-0">
          {renderSections
            ? renderSections(formWithDefaults)
            : sections?.map((section) => (
                <SectionCard
                  key={section.title}
                  title={section.title}
                  description={section.description}
                  required={section.required}
                >
                  <div className="grid gap-ds-4 sm:grid-cols-2">{section.children}</div>
                </SectionCard>
              ))}
        </fieldset>

        {(submitError ?? error) && (
          <p role="alert" className="text-sm text-ds-danger">
            {submitError ?? error}
          </p>
        )}
      </form>
      </PageContainer>
    </FormProvider>
  );
}

export interface FormRowProps {
  name: string;
  label: string;
  required?: boolean;
  hint?: string;
  /** Spans both columns of the section grid. */
  wide?: boolean;
  children: React.ReactNode;
}

/**
 * Labelled field wrapper. Reads the error for `name` off the surrounding
 * form context, so callers never wire up validation display by hand.
 */
export function FormRow({ name, label, required, hint, wide, children }: FormRowProps) {
  const { formState } = useFormContext();
  const error = name
    .split('.')
    .reduce<unknown>(
      (acc, key) => (acc as Record<string, unknown> | undefined)?.[key],
      formState.errors,
    ) as { message?: string } | undefined;

  return (
    <div className={cn('flex flex-col gap-ds-1', wide && 'sm:col-span-2')}>
      <Label htmlFor={name}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-ds-danger">
            *
          </span>
        )}
      </Label>
      {children}
      {error?.message ? (
        <p id={`${name}-error`} role="alert" className="text-xs text-ds-danger">
          {error.message}
        </p>
      ) : (
        hint && <p className="text-xs text-ds-foreground-muted">{hint}</p>
      )}
    </div>
  );
}
