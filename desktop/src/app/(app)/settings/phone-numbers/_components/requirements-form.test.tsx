import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import * as React from 'react';

import type { KycRequirement } from '@/lib/api/voip';
import { RequirementsForm, answersFrom, buildDocumentsForm, validateRequirements } from './requirements-form';

// The draft Dutch list (master migration 0029): one of each field type the form must render.
const NL: KycRequirement[] = [
  { key: 'businessName', label: 'Business name', type: 'text', required: true },
  { key: 'registrationNumber', label: 'Business registration number', type: 'text', required: true },
  { key: 'address', label: 'Registered business address in the country', type: 'address', required: true },
  { key: 'representativeName', label: 'Representative full name', type: 'text', required: true },
  { key: 'registrationExtract', label: 'Registration extract', type: 'file', required: true },
];

const WITH_DATE: KycRequirement[] = [...NL, { key: 'incorporatedOn', label: 'Date of registration', type: 'date', required: false }];

function pdf(name = 'extract.pdf') {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' });
}

function fill(testId: string, value: string) {
  const input = within(screen.getByTestId(testId)).getByRole('textbox') as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

describe('RequirementsForm', () => {
  it('renders one input per requirement, by type', () => {
    render(<RequirementsForm requirements={WITH_DATE} onSubmit={() => undefined} />);
    expect(screen.getByTestId('req-field-businessName').getAttribute('data-type')).toBe('text');
    expect(screen.getByTestId('req-field-address').getAttribute('data-type')).toBe('address');
    expect(screen.getByTestId('req-field-registrationExtract').getAttribute('data-type')).toBe('file');
    // text, date
    expect(within(screen.getByTestId('req-field-businessName')).getByRole('textbox')).toBeTruthy();
    expect((screen.getByTestId('req-field-incorporatedOn').querySelector('input') as HTMLInputElement).type).toBe('date');
    // address: the street (autocomplete input, plain input without the Maps key) and the manual postal code, city and region
    expect(screen.getByTestId('req-address-postalCode')).toBeTruthy();
    expect(screen.getByTestId('req-address-city')).toBeTruthy();
    expect(screen.getByTestId('req-address-region')).toBeTruthy();
    // file: the drop zone with its hidden file input
    expect(screen.getByTestId('req-field-registrationExtract').querySelector('input[type="file"]')).toBeTruthy();
    // known keys use the catalogue label, the optional date is marked
    expect(screen.getByText('Business registration number')).toBeTruthy();
    expect(within(screen.getByTestId('req-field-incorporatedOn')).getByText('(optional)')).toBeTruthy();
  });

  it('does not submit while a required field is empty and says which one', () => {
    const onSubmit = vi.fn();
    render(<RequirementsForm requirements={NL} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('requirements-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('req-error-businessName').textContent).toBe('Business name is required.');
    expect(screen.getByTestId('req-error-address').textContent).toContain('is required');
    expect(screen.getByText('Attach Registration extract.')).toBeTruthy();
  });

  it('asks for the whole address when only part of it is filled', () => {
    const answers = answersFrom(NL, null, undefined);
    answers.text.businessName = 'Acme Travel BV';
    answers.text.registrationNumber = '12345678';
    answers.text.representativeName = 'Jan de Vries';
    answers.files.registrationExtract = pdf();
    answers.address.address = { street: 'Damrak 1', postalCode: '', city: '', region: '' };
    expect(validateRequirements(NL, answers)).toEqual({ address: 'address' });
    answers.address.address = { street: 'Damrak 1', postalCode: '1012 LG', city: 'Amsterdam', region: '' };
    expect(validateRequirements(NL, answers)).toEqual({});
  });

  it('checks that a date is a date', () => {
    const answers = answersFrom(WITH_DATE, null, undefined);
    answers.text.incorporatedOn = 'not a date';
    expect(validateRequirements(WITH_DATE, answers).incorporatedOn).toBe('date');
    answers.text.incorporatedOn = '2020-05-17';
    expect(validateRequirements(WITH_DATE, answers).incorporatedOn).toBeUndefined();
  });

  it('submits a multipart body: text fields, the address as JSON, the file under its key and the number type', () => {
    const onSubmit = vi.fn();
    const { container } = render(<RequirementsForm requirements={NL} numberTypes={['local', 'mobile']} onSubmit={onSubmit} />);
    fill('req-field-businessName', 'Acme Travel BV');
    fill('req-field-registrationNumber', '12345678');
    fill('req-field-representativeName', 'Jan de Vries');
    // the street is the first textbox of the address field
    fireEvent.change(within(screen.getByTestId('req-field-address')).getAllByRole('textbox')[0]!, { target: { value: 'Damrak 1' } });
    fireEvent.change(screen.getByTestId('req-address-postalCode'), { target: { value: '1012 LG' } });
    fireEvent.change(screen.getByTestId('req-address-city'), { target: { value: 'Amsterdam' } });
    const file = pdf();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByTestId('requirements-submit'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const form = onSubmit.mock.calls[0]![0] as FormData;
    expect(form.get('businessName')).toBe('Acme Travel BV');
    expect(form.get('registrationNumber')).toBe('12345678');
    expect(form.get('representativeName')).toBe('Jan de Vries');
    expect(JSON.parse(form.get('address') as string)).toEqual({ street: 'Damrak 1', city: 'Amsterdam', postalCode: '1012 LG' });
    expect((form.get('registrationExtract') as File).name).toBe('extract.pdf');
    expect(form.get('numberType')).toBe('local');
  });

  it('starts a correction from the answers already sent', () => {
    const document = {
      id: 'd1',
      country: 'NL',
      status: 'rejected' as const,
      details: { businessName: 'Acme Travel BV', registrationNumber: '12345678', representativeName: 'Jan', address: { street: 'Damrak 1', city: 'Amsterdam', postalCode: '1012 LG' } },
      files: [{ name: 'old-extract.pdf', field: 'registrationExtract' }],
      reviewNote: 'The extract is unreadable',
      submittedAt: '2026-10-20T10:00:00Z',
    };
    render(<RequirementsForm requirements={NL} document={document} onSubmit={() => undefined} />);
    expect((within(screen.getByTestId('req-field-businessName')).getByRole('textbox') as HTMLInputElement).value).toBe('Acme Travel BV');
    expect((screen.getByTestId('req-address-city') as HTMLInputElement).value).toBe('Amsterdam');
    // a file cannot be pre-filled: the form says what was sent and asks for it again
    expect(screen.getByText(/Sent before: old-extract\.pdf/)).toBeTruthy();
  });

  it('shows the error from the last attempt and disables the button while sending', () => {
    render(<RequirementsForm requirements={NL} submitting error="Some required information is missing or not valid." onSubmit={() => undefined} />);
    expect(screen.getByTestId('requirements-error').textContent).toContain('Some required information');
    expect((screen.getByTestId('requirements-submit') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('buildDocumentsForm', () => {
  it('leaves out empty optional answers', () => {
    const answers = answersFrom(WITH_DATE, null, undefined);
    answers.text.businessName = ' Acme ';
    const form = buildDocumentsForm(WITH_DATE, answers);
    expect(form.get('businessName')).toBe('Acme');
    expect(form.has('incorporatedOn')).toBe(false);
    expect(form.has('address')).toBe(false);
    expect(form.has('registrationExtract')).toBe(false);
  });
});
