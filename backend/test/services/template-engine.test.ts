import { describe, it, expect } from 'vitest';
import { substituteVariables } from '../../src/services/template-engine';

describe('substituteVariables', () => {
  it('should substitute a single variable', () => {
    const result = substituteVariables('Hello {name}!', { name: 'John' });
    expect(result).toBe('Hello John!');
  });

  it('should substitute multiple variables', () => {
    const result = substituteVariables(
      'Dear {name}, your trip to {destination} is confirmed.',
      { name: 'Alice', destination: 'Paris' }
    );
    expect(result).toBe('Dear Alice, your trip to Paris is confirmed.');
  });

  it('should replace missing variables with empty string', () => {
    const result = substituteVariables(
      'Hello {name}, your flight is on {travel_date}.',
      { name: 'Bob' }
    );
    expect(result).toBe('Hello Bob, your flight is on .');
  });

  it('should replace null values with empty string', () => {
    const result = substituteVariables(
      'Phone: {phone}',
      { phone: null }
    );
    expect(result).toBe('Phone: ');
  });

  it('should replace undefined values with empty string', () => {
    const result = substituteVariables(
      'Phone: {phone}',
      { phone: undefined }
    );
    expect(result).toBe('Phone: ');
  });

  it('should handle template with no variables', () => {
    const result = substituteVariables('No variables here.', { name: 'unused' });
    expect(result).toBe('No variables here.');
  });

  it('should handle empty template', () => {
    const result = substituteVariables('', { name: 'unused' });
    expect(result).toBe('');
  });

  it('should handle empty data object', () => {
    const result = substituteVariables('Hello {name}!', {});
    expect(result).toBe('Hello !');
  });

  it('should handle multiple occurrences of the same variable', () => {
    const result = substituteVariables(
      '{name} loves {name}',
      { name: 'Alice' }
    );
    expect(result).toBe('Alice loves Alice');
  });

  it('should not substitute variables with special characters in name', () => {
    // \w only matches word characters, so {name-with-dash} should not be replaced
    const result = substituteVariables(
      'Hello {name-with-dash}!',
      { 'name-with-dash': 'Test' } as any
    );
    // The regex uses \w which doesn't match hyphens
    expect(result).toBe('Hello {name-with-dash}!');
  });

  it('should handle underscore in variable names', () => {
    const result = substituteVariables(
      'Date: {travel_date}',
      { travel_date: '2025-03-15' }
    );
    expect(result).toBe('Date: 2025-03-15');
  });

  it('should handle numeric string values', () => {
    const result = substituteVariables(
      'Pax: {pax_count}',
      { pax_count: '5' }
    );
    expect(result).toBe('Pax: 5');
  });

  it('should handle all common travel CRM variables', () => {
    const data = {
      customer_name: 'John Doe',
      first_name: 'John',
      destination: 'Bali',
      travel_date: '2025-04-01',
      return_date: '2025-04-10',
      pax_count: '4',
      amount: '50000',
      company_name: 'TravelCo',
      agent_name: 'Agent Smith',
    };

    const template = `Dear {first_name},

Your booking to {destination} from {travel_date} to {return_date} for {pax_count} pax is confirmed.
Total: INR {amount}

Regards,
{agent_name}
{company_name}`;

    const result = substituteVariables(template, data);

    expect(result).toContain('Dear John,');
    expect(result).toContain('Bali');
    expect(result).toContain('2025-04-01');
    expect(result).toContain('2025-04-10');
    expect(result).toContain('4 pax');
    expect(result).toContain('INR 50000');
    expect(result).toContain('Agent Smith');
    expect(result).toContain('TravelCo');
  });

  it('should preserve curly braces that are not valid variable patterns', () => {
    const result = substituteVariables(
      'JSON: { "key": "value" }',
      {}
    );
    // Standalone braces without word chars shouldn't be touched
    expect(result).toBe('JSON: { "key": "value" }');
  });
});
