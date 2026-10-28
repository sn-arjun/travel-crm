import { describe, expect, it } from 'vitest';
import {
  bankCountryOf,
  bankFieldError,
  bankFieldsFor,
  bankPrintLines,
  formatIban,
  isSepaCountry,
  isValidBic,
  isValidIban,
  isValidRoutingNumber,
  isValidSixDigitCode,
  readBankDetails,
} from './bank-details';

// The same cases as backend/test/bank-details.test.ts: the two copies of the rules must agree.

describe('bankFieldsFor', () => {
  it('gives each country its own set', () => {
    expect(bankFieldsFor('IN')).toEqual(['accountName', 'accountNumber', 'ifsc', 'bankName', 'branch', 'upiId']);
    expect(bankFieldsFor('GB')).toEqual(['accountName', 'sortCode', 'accountNumber', 'iban', 'bic']);
    expect(bankFieldsFor('NL')).toEqual(['accountName', 'iban', 'bic', 'bankName']);
    expect(bankFieldsFor('CH')).toEqual(['accountName', 'iban', 'bic', 'bankName']);
    expect(bankFieldsFor('US')).toEqual(['accountName', 'routingNumber', 'accountNumber', 'swift']);
    expect(bankFieldsFor('AU')).toEqual(['accountName', 'bsb', 'accountNumber']);
    expect(bankFieldsFor('AE')).toEqual(['accountName', 'iban', 'swift']);
    expect(bankFieldsFor('BR')).toEqual(['accountName', 'iban', 'accountNumber', 'swift']);
    expect(bankFieldsFor('')).toEqual(['accountName', 'iban', 'accountNumber', 'swift']);
  });

  it('shows IFSC and UPI for India only', () => {
    for (const c of ['NL', 'GB', 'US', 'AU', 'AE', 'BR', '']) {
      expect(bankFieldsFor(c)).not.toContain('ifsc');
      expect(bankFieldsFor(c)).not.toContain('upiId');
    }
  });
});

describe('validators', () => {
  it('IBAN mod-97', () => {
    for (const ok of ['NL91ABNA0417164300', 'NL91 ABNA 0417 1643 00', 'nl91abna0417164300', 'DE89 3704 0044 0532 0130 00', 'GB29 NWBK 6016 1331 9268 19']) {
      expect(isValidIban(ok), ok).toBe(true);
    }
    for (const bad of ['NL91ABNA0417164301', 'DE89370400440532013001', 'GB29NWBK60161331926818', 'NL91', '1234567890', '']) {
      expect(isValidIban(bad), bad).toBe(false);
    }
  });
  it('groups an IBAN in fours', () => {
    expect(formatIban('nl91abna0417164300')).toBe('NL91 ABNA 0417 1643 00');
  });
  it('BIC or SWIFT is 8 or 11 characters', () => {
    expect(isValidBic('ABNANL2A')).toBe(true);
    expect(isValidBic('ABNANL2AXXX')).toBe(true);
    expect(isValidBic('ABNANL2')).toBe(false);
    expect(isValidBic('ABNANL2AX')).toBe(false);
  });
  it('sort code and BSB are 6 digits', () => {
    expect(isValidSixDigitCode('60-16-13')).toBe(true);
    expect(isValidSixDigitCode('062000')).toBe(true);
    expect(isValidSixDigitCode('6016')).toBe(false);
  });
  it('routing number carries the ABA checksum', () => {
    expect(isValidRoutingNumber('021000021')).toBe(true);
    expect(isValidRoutingNumber('011401533')).toBe(true);
    expect(isValidRoutingNumber('021000022')).toBe(false);
  });
});

describe('bankFieldError', () => {
  it('checks only the fields of the country', () => {
    expect(bankFieldError('NL', { iban: 'NL91ABNA0417164301' })).toEqual({ field: 'iban', key: 'banks.error.iban' });
    expect(bankFieldError('NL', { iban: 'NL91ABNA0417164300', bic: 'ABN' })).toEqual({ field: 'bic', key: 'banks.error.bic' });
    expect(bankFieldError('GB', { sortCode: '12-34' })?.field).toBe('sortCode');
    expect(bankFieldError('AU', { bsb: '1' })?.field).toBe('bsb');
    expect(bankFieldError('US', { routingNumber: '123456789' })?.field).toBe('routingNumber');
    expect(bankFieldError('IN', { iban: 'garbage', ifsc: 'SBIN0001234' })).toBeNull();
    expect(bankFieldError('NL', { iban: '  ', bic: '' })).toBeNull();
  });
});

describe('bankPrintLines', () => {
  it('prints only the filled fields of the country, IBAN grouped', () => {
    const lines = bankPrintLines('NL', { accountName: 'Reisbureau BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', ifsc: 'SBIN0001234' }, (f) => f);
    expect(lines).toEqual([
      { field: 'accountName', label: 'accountName', value: 'Reisbureau BV' },
      { field: 'iban', label: 'iban', value: 'NL91 ABNA 0417 1643 00' },
      { field: 'bic', label: 'bic', value: 'ABNANL2A' },
    ]);
  });
});

describe('readBankDetails', () => {
  it('reads old keys, JSON text and the separate upi_id', () => {
    expect(readBankDetails('{"bankName":"HDFC","accountHolderName":"Old Travels","ifsc":"HDFC0000001"}', 'old@upi')).toEqual({
      bankName: 'HDFC',
      accountName: 'Old Travels',
      ifsc: 'HDFC0000001',
      upiId: 'old@upi',
    });
    expect(readBankDetails(null)).toEqual({});
    expect(readBankDetails('not json')).toEqual({});
  });
});

describe('bankCountryOf', () => {
  it('reads codes and names, then the locale, then the rupee rule', () => {
    expect(bankCountryOf('nl')).toBe('NL');
    expect(bankCountryOf('Netherlands')).toBe('NL');
    expect(bankCountryOf('United Kingdom')).toBe('GB');
    expect(bankCountryOf('UAE')).toBe('AE');
    expect(bankCountryOf('Narnia')).toBe('');
    expect(bankCountryOf('', 'DE', 'EUR')).toBe('DE');
    expect(bankCountryOf('', '', 'INR')).toBe('IN');
    expect(bankCountryOf('', '', 'EUR')).toBe('');
  });
});

describe('isSepaCountry', () => {
  it('is true for EU, EEA and Switzerland only', () => {
    expect(isSepaCountry('NL')).toBe(true);
    expect(isSepaCountry('no')).toBe(true);
    expect(isSepaCountry('CH')).toBe(true);
    expect(isSepaCountry('GB')).toBe(false);
    expect(isSepaCountry('IN')).toBe(false);
    expect(isSepaCountry('')).toBe(false);
  });
});
