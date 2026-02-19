import { uuidv7 } from 'uuidv7';

/**
 * Generate a UUIDv7 (time-sortable, globally unique).
 *
 * UUIDv7 embeds a Unix timestamp in the first 48 bits,
 * providing natural chronological ordering in database indexes
 * and better B-tree locality in SQLite.
 */
export function generateId(): string {
  return uuidv7();
}
