import { describe, it, expect } from 'vitest';
import { generateId } from '../src/utils/uuid';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateId (UUIDv7)', () => {
  it('is a valid UUIDv7', () => {
    expect(generateId()).toMatch(UUID_V7);
  });

  it('is strictly increasing, including many ids in the same millisecond', () => {
    const ids = Array.from({ length: 20000 }, () => generateId());
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] > ids[i - 1], `ids[${i}] ${ids[i]} must sort after ${ids[i - 1]}`).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps ordering across repeated bursts', () => {
    let prev = generateId();
    for (let burst = 0; burst < 50; burst++) {
      for (let i = 0; i < 200; i++) {
        const next = generateId();
        expect(next > prev).toBe(true);
        prev = next;
      }
    }
  });
});
