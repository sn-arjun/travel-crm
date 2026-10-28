'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';

import { AddressAutocomplete, Button, FileDropzone, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useT, type TranslateFn } from '@/lib/i18n';
import type { KycRequirement, NumberKycDocument, NumberType } from '@/lib/api/voip';

/** What the backend accepts for one file (services/voip/regulatory.ts): PDF, PNG or JPEG, 10 MB, six files. */
export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export interface AddressAnswer {
  street: string;
  postalCode: string;
  city: string;
  region: string;
}

export interface RequirementAnswers {
  text: Record<string, string>;
  address: Record<string, AddressAnswer>;
  files: Record<string, File | undefined>;
  numberType: NumberType;
}

export type RequirementProblem = 'required' | 'address' | 'date';

const EMPTY_ADDRESS: AddressAnswer = { street: '', postalCode: '', city: '', region: '' };

/** The requirement keys the catalogue has a label for; any other key shows the label the platform wrote. */
const TRANSLATED_LABELS = new Set(['businessName', 'registrationNumber', 'address', 'representativeName', 'registrationExtract']);

export function requirementLabel(t: TranslateFn, r: KycRequirement): string {
  return TRANSLATED_LABELS.has(r.key) ? t(`calling.req.label.${r.key}`) : r.label;
}

/** The answers a saved set already holds, so a correction starts from what was sent. Files are never kept client-side. */
export function answersFrom(requirements: KycRequirement[], document: NumberKycDocument | null | undefined, numberType: string | undefined): RequirementAnswers {
  const answers: RequirementAnswers = { text: {}, address: {}, files: {}, numberType: numberType === 'mobile' || numberType === 'national' ? numberType : 'local' };
  const details = (document?.details ?? {}) as Record<string, unknown>;
  for (const r of requirements) {
    const value = details[r.key];
    if (r.type === 'address') {
      const a = value && typeof value === 'object' ? (value as Partial<AddressAnswer>) : null;
      answers.address[r.key] = a
        ? { street: a.street ?? '', postalCode: a.postalCode ?? '', city: a.city ?? '', region: a.region ?? '' }
        : { ...EMPTY_ADDRESS, street: typeof value === 'string' ? value : '' };
    } else if (r.type !== 'file') {
      answers.text[r.key] = typeof value === 'string' ? value : '';
    }
  }
  return answers;
}

/** The problems of an answer set against the requirement list (empty = complete). Same rules as the backend. */
export function validateRequirements(requirements: KycRequirement[], answers: RequirementAnswers): Record<string, RequirementProblem> {
  const problems: Record<string, RequirementProblem> = {};
  for (const r of requirements) {
    if (r.type === 'file') {
      if (r.required && !answers.files[r.key]) problems[r.key] = 'required';
    } else if (r.type === 'address') {
      const a = answers.address[r.key] ?? EMPTY_ADDRESS;
      const filled = [a.street, a.city, a.postalCode].filter((x) => x.trim()).length;
      if (filled === 0) {
        if (r.required) problems[r.key] = 'required';
      } else if (filled < 3) {
        problems[r.key] = 'address';
      }
    } else {
      const v = (answers.text[r.key] ?? '').trim();
      if (!v) {
        if (r.required) problems[r.key] = 'required';
      } else if (r.type === 'date' && Number.isNaN(Date.parse(v))) {
        problems[r.key] = 'date';
      }
    }
  }
  return problems;
}

/** The multipart body of POST /voip/numbers/documents: one field per text requirement, an address as JSON, one file part per file requirement. */
export function buildDocumentsForm(requirements: KycRequirement[], answers: RequirementAnswers): FormData {
  const form = new FormData();
  for (const r of requirements) {
    if (r.type === 'file') {
      const file = answers.files[r.key];
      if (file) form.append(r.key, file, file.name);
    } else if (r.type === 'address') {
      const a = answers.address[r.key];
      if (a && (a.street.trim() || a.city.trim() || a.postalCode.trim())) {
        form.append(r.key, JSON.stringify({ street: a.street.trim(), city: a.city.trim(), postalCode: a.postalCode.trim(), ...(a.region.trim() && { region: a.region.trim() }) }));
      }
    } else {
      const v = (answers.text[r.key] ?? '').trim();
      if (v) form.append(r.key, v);
    }
  }
  form.append('numberType', answers.numberType);
  return form;
}

export interface RequirementsFormProps {
  requirements: KycRequirement[];
  numberTypes?: NumberType[];
  /** The set already sent (a correction after a rejection starts from its answers). */
  document?: NumberKycDocument | null;
  numberType?: string;
  submitting?: boolean;
  /** A message from the last attempt (the server's reason). */
  error?: string | null;
  onSubmit: (form: FormData) => void;
  onCancel?: () => void;
}

/**
 * The agency's number documents for a country with a requirement list (R141-1): one input per requirement, by type.
 * Text and date are inputs; an address is a street (Google Places when the key is set, a plain input otherwise) with
 * the postal code, city and region typed by hand; a file is a drop zone.
 */
export function RequirementsForm({ requirements, numberTypes = ['local'], document, numberType, submitting, error, onSubmit, onCancel }: RequirementsFormProps) {
  const t = useT();
  const [answers, setAnswers] = React.useState<RequirementAnswers>(() => answersFrom(requirements, document, numberType));
  const [problems, setProblems] = React.useState<Record<string, RequirementProblem>>({});

  const setText = (key: string, value: string) => setAnswers((p) => ({ ...p, text: { ...p.text, [key]: value } }));
  const setAddress = (key: string, patch: Partial<AddressAnswer>) =>
    setAnswers((p) => ({ ...p, address: { ...p.address, [key]: { ...(p.address[key] ?? EMPTY_ADDRESS), ...patch } } }));

  const submit = () => {
    const found = validateRequirements(requirements, answers);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(buildDocumentsForm(requirements, answers));
  };

  const problemText = (r: KycRequirement): string | null => {
    const p = problems[r.key];
    if (!p) return null;
    const label = requirementLabel(t, r);
    if (p === 'address') return t('calling.req.error.address', { label });
    if (p === 'date') return t('calling.req.error.date', { label });
    return r.type === 'file' ? t('calling.req.error.file', { label }) : t('calling.req.error.required', { label });
  };

  const previouslySent = (key: string) => document?.files.find((f) => f.field === key)?.name;

  return (
    <div className="flex flex-col gap-ds-4" data-testid="requirements-form">
      {requirements.map((r) => {
        const label = requirementLabel(t, r);
        const id = `req-${r.key}`;
        const problem = problemText(r);
        const labelNode = (
          <Label htmlFor={id}>
            {label}
            {!r.required && <span className="ms-ds-1 text-xs text-ds-foreground-muted">{t('calling.req.optional')}</span>}
          </Label>
        );
        return (
          <div key={r.key} className="flex flex-col gap-ds-2" data-testid={`req-field-${r.key}`} data-type={r.type}>
            {labelNode}
            {r.type === 'text' && (
              <Input id={id} value={answers.text[r.key] ?? ''} onChange={(e) => setText(r.key, e.target.value)} aria-invalid={!!problem} />
            )}
            {r.type === 'date' && (
              <Input id={id} type="date" value={answers.text[r.key] ?? ''} onChange={(e) => setText(r.key, e.target.value)} aria-invalid={!!problem} />
            )}
            {r.type === 'address' && (
              <div className="flex flex-col gap-ds-2">
                <AddressAutocomplete
                  value={answers.address[r.key]?.street ?? ''}
                  onChange={(v) => setAddress(r.key, { street: v })}
                  onAddressSelect={(parts) => setAddress(r.key, { street: parts.address, city: parts.city, postalCode: parts.postalCode, region: parts.state })}
                  placeholder={t('calling.req.address.street')}
                />
                <div className="grid grid-cols-1 gap-ds-2 sm:grid-cols-3">
                  <Input aria-label={t('calling.req.address.postalCode')} placeholder={t('calling.req.address.postalCode')} data-testid={`${id}-postalCode`} value={answers.address[r.key]?.postalCode ?? ''} onChange={(e) => setAddress(r.key, { postalCode: e.target.value })} />
                  <Input aria-label={t('calling.req.address.city')} placeholder={t('calling.req.address.city')} data-testid={`${id}-city`} value={answers.address[r.key]?.city ?? ''} onChange={(e) => setAddress(r.key, { city: e.target.value })} />
                  <Input aria-label={t('calling.req.address.region')} placeholder={t('calling.req.address.region')} data-testid={`${id}-region`} value={answers.address[r.key]?.region ?? ''} onChange={(e) => setAddress(r.key, { region: e.target.value })} />
                </div>
              </div>
            )}
            {r.type === 'file' && (
              <>
                <FileDropzone
                  accept={DOCUMENT_ACCEPT}
                  maxSize={DOCUMENT_MAX_BYTES}
                  files={answers.files[r.key] ? [answers.files[r.key] as File] : []}
                  onFiles={(files) => setAnswers((p) => ({ ...p, files: { ...p.files, [r.key]: files[0] } }))}
                  onRemove={() => setAnswers((p) => ({ ...p, files: { ...p.files, [r.key]: undefined } }))}
                  hint={t('calling.req.fileHint')}
                  error={problem ?? undefined}
                />
                {previouslySent(r.key) && !answers.files[r.key] && (
                  <p className="text-xs text-ds-foreground-muted">{t('calling.req.fileSentBefore', { name: previouslySent(r.key) ?? '' })}</p>
                )}
              </>
            )}
            {problem && r.type !== 'file' && (
              <p role="alert" className="text-xs text-ds-danger" data-testid={`req-error-${r.key}`}>
                {problem}
              </p>
            )}
          </div>
        );
      })}

      {numberTypes.length > 1 && (
        <div className="flex flex-col gap-ds-2">
          <Label>{t('calling.req.numberType')}</Label>
          <Select value={answers.numberType} onValueChange={(v) => setAnswers((p) => ({ ...p, numberType: v as NumberType }))}>
            <SelectTrigger className="w-60" aria-label={t('calling.req.numberType')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numberTypes.map((n) => (
                <SelectItem key={n} value={n}>
                  {t(`calling.req.numberType.${n}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-ds-danger" data-testid="requirements-error">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-ds-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            {t('calling.common.cancel')}
          </Button>
        )}
        <Button onClick={submit} disabled={submitting} className="gap-ds-2" data-testid="requirements-submit">
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {t('calling.req.submit')}
        </Button>
      </div>
    </div>
  );
}
