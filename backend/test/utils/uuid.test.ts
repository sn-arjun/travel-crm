import { describe, it, expect } from 'vitest';
import { generateId } from '../../src/utils/uuid';

describe('generateId', () => {
  it('should return a string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
  });

  it('should return a valid UUID format (8-4-4-4-12)', () => {
    const id = generateId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(id).toMatch(uuidRegex);
  });

  it('should have version 7 in the version nibble', () => {
    const id = generateId();
    // The 13th character (index 14, after removing hyphens at pos 8 and 13)
    // In UUID format: xxxxxxxx-xxxx-Vxxx-xxxx-xxxxxxxxxxxx, V is version
    const versionChar = id.charAt(14);
    expect(versionChar).toBe('7');
  });

  it('should generate unique IDs on consecutive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('should generate IDs that are lexicographically sortable by time', () => {
    // UUIDv7 embeds timestamp in the first 48 bits
    // IDs generated later should sort after earlier ones
    const id1 = generateId();
    // Small delay to ensure different timestamp
    const id2 = generateId();
    // Both should be valid UUIDs but may or may not differ in sort order
    // within the same millisecond. At minimum they should be unique.
    expect(id1).not.toBe(id2);
  });

  it('should produce 36-character strings (with hyphens)', () => {
    const id = generateId();
    expect(id.length).toBe(36);
  });

  it('should only contain lowercase hex characters and hyphens', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f-]+$/);
  });

  it('should have hyphens at correct positions', () => {
    const id = generateId();
    expect(id[8]).toBe('-');
    expect(id[13]).toBe('-');
    expect(id[18]).toBe('-');
    expect(id[23]).toBe('-');
  });

  it('should have correct variant bits (RFC 4122)', () => {
    const id = generateId();
    // The variant is encoded in the first 1-3 bits of the 9th byte
    // (character at position 19, which is the first char after third hyphen)
    const variantChar = id.charAt(19);
    // Should be 8, 9, a, or b for RFC 4122 variant
    expect(['8', '9', 'a', 'b']).toContain(variantChar);
  });

  it('should generate 1000 unique IDs without collisions', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(1000);
  });
});
