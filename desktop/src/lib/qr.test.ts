import { describe, it, expect } from 'vitest';
import { qrMatrix } from './qr';

const toRows = (text: string) => qrMatrix(text).map((row) => row.map((dark) => (dark ? '#' : '.')).join(''));

describe('qrMatrix', () => {
  // These rows were produced by this encoder and confirmed identical to an independent encoder (pdfmake's qr.js)
  // for every text length from 1 to 213 bytes at level M, so a change that alters the output is a regression.
  it('encodes HELLO WORLD as the known version 1 symbol', () => {
    expect(toRows('HELLO WORLD')).toEqual([
      '#######.##..#.#######',
      '#.....#....#..#.....#',
      '#.###.#..#.#..#.###.#',
      '#.###.#.#..#..#.###.#',
      '#.###.#.###.#.#.###.#',
      '#.....#.#..#..#.....#',
      '#######.#.#.#.#######',
      '........#..##........',
      '#...#.######.#####..#',
      '...#....#.###....####',
      '..######..##.##.#..#.',
      '#####...##...#.......',
      '#####.#.#.#.#.##..##.',
      '........#.#.####.#.##',
      '#######.###.#.#.##.#.',
      '#.....#..#.###.##..##',
      '#.###.#.##.#.##...##.',
      '#.###.#..#..#...##.##',
      '#.###.#..###...###...',
      '#.....#....#.#.......',
      '#######.#########.#.#',
    ]);
  });

  it('picks the smallest version and always draws the three finder patterns', () => {
    const sizes: Array<[number, number]> = [[10, 21], [14, 21], [15, 25], [26, 25], [27, 29], [42, 29], [43, 33], [213, 57]];
    for (const [length, size] of sizes) {
      const m = qrMatrix('a'.repeat(length));
      expect(m.length, `${length} bytes`).toBe(size);
      for (const [x, y] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
        expect(m[y]![x]).toBe(true);
        expect(m[y + 3]![x + 3]).toBe(true);
        expect(m[y + 1]![x + 1]).toBe(false);
        expect(m[y + 6]![x + 6]).toBe(true);
      }
      expect(m[size - 8]![8], 'dark module').toBe(true);
    }
  });

  it('encodes an authenticator address deterministically', () => {
    const uri = 'otpauth://totp/TravelCRM%20Pro:admin%40demo.com?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=TravelCRM%20Pro';
    const a = toRows(uri);
    expect(a.length).toBe(45);
    expect(toRows(uri)).toEqual(a);
  });

  it('refuses text that does not fit', () => {
    expect(() => qrMatrix('a'.repeat(214))).toThrow(/too long/);
  });
});
