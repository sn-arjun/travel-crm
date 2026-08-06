import { describe, it, expect } from 'vitest';
import { parseUserAgent } from '../../src/utils/user-agent-parser';

describe('parseUserAgent', () => {
  // ─── Null / Undefined / Empty ─────────────────────────────────

  it('should return Unknown for null input', () => {
    const result = parseUserAgent(null);
    expect(result).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'Unknown' });
  });

  it('should return Unknown for undefined input', () => {
    const result = parseUserAgent(undefined);
    expect(result).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'Unknown' });
  });

  it('should return Unknown for empty string', () => {
    const result = parseUserAgent('');
    expect(result).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'Unknown' });
  });

  // ─── Chrome ───────────────────────────────────────────────────

  it('should detect Chrome on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('Windows 10/11');
    expect(result.device).toBe('Desktop');
  });

  it('should detect Chrome on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('macOS');
    expect(result.device).toBe('Desktop');
  });

  // ─── Firefox ──────────────────────────────────────────────────

  it('should detect Firefox on Linux', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Firefox');
    expect(result.os).toBe('Linux');
    expect(result.device).toBe('Desktop');
  });

  // ─── Safari ───────────────────────────────────────────────────

  it('should detect Safari on macOS', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Safari');
    expect(result.os).toBe('macOS');
    expect(result.device).toBe('Desktop');
  });

  // ─── Edge ─────────────────────────────────────────────────────

  it('should detect Edge on Windows', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Edge');
    expect(result.os).toBe('Windows 10/11');
    expect(result.device).toBe('Desktop');
  });

  // ─── Opera ────────────────────────────────────────────────────

  it('should detect Opera', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Opera');
    expect(result.os).toBe('Windows 10/11');
  });

  // ─── IE ───────────────────────────────────────────────────────

  it('should detect Internet Explorer', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; WOW64; Trident/7.0; rv:11.0) like Gecko';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('IE');
  });

  // ─── Mobile Devices ──────────────────────────────────────────

  it('should detect mobile Chrome on Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Chrome');
    expect(result.os).toBe('Android');
    expect(result.device).toBe('Mobile');
  });

  it('should detect Safari on iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);
    expect(result.browser).toBe('Safari');
    // Note: parseOS checks "Mac OS X" before "iPhone", so iPhone UAs (which contain
    // "like Mac OS X") are detected as macOS — this is a known limitation of the parser.
    expect(result.os).toBe('macOS');
    expect(result.device).toBe('Mobile');
  });

  // ─── Tablets ──────────────────────────────────────────────────

  it('should detect iPad', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const result = parseUserAgent(ua);
    // Limitation: "like Mac OS X" matches before iPad-specific iOS check
    expect(result.os).toBe('macOS');
    // Limitation: "Mobile/15E148" in the UA triggers the Mobile check before the iPad/Tablet check
    expect(result.device).toBe('Mobile');
  });

  it('should detect iPad without Mobile keyword as tablet', () => {
    // Some iPadOS Safari UAs (desktop mode) omit "Mobile" entirely
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1';
    const result = parseUserAgent(ua);
    expect(result.device).toBe('Tablet');
  });

  it('should detect Android tablet (no Mobile keyword)', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.os).toBe('Android');
    expect(result.device).toBe('Tablet');
  });

  // ─── Chrome OS ────────────────────────────────────────────────

  it('should detect Chrome OS', () => {
    const ua = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.os).toBe('Chrome OS');
    expect(result.device).toBe('Desktop');
  });

  // ─── Older Windows ────────────────────────────────────────────

  it('should detect older Windows versions', () => {
    const ua = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const result = parseUserAgent(ua);
    expect(result.os).toBe('Windows');
  });
});
