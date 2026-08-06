import { describe, it, expect } from 'vitest';
import { escapeHtml, stripHtml, sanitizeInput, sanitizeFilename } from '../../src/utils/sanitize';

describe('escapeHtml', () => {
  it('should escape ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('should escape angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('should escape double quotes', () => {
    expect(escapeHtml('class="evil"')).toBe('class=&quot;evil&quot;');
  });

  it('should escape single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#x27;s");
  });

  it('should escape forward slashes', () => {
    expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
  });

  it('should handle empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should not alter strings without special characters', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });

  it('should handle multiple special characters together', () => {
    expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
      '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;'
    );
  });

  it('should handle XSS payloads with event handlers', () => {
    const payload = '<div onmouseover="steal()">';
    const result = escapeHtml(payload);
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
  });
});

describe('stripHtml', () => {
  it('should remove simple HTML tags', () => {
    expect(stripHtml('<b>bold</b>')).toBe('bold');
  });

  it('should remove self-closing tags', () => {
    expect(stripHtml('line1<br/>line2')).toBe('line1line2');
  });

  it('should remove tags with attributes', () => {
    expect(stripHtml('<a href="http://evil.com">click</a>')).toBe('click');
  });

  it('should remove nested tags', () => {
    expect(stripHtml('<div><p><strong>deep</strong></p></div>')).toBe('deep');
  });

  it('should handle empty string', () => {
    expect(stripHtml('')).toBe('');
  });

  it('should leave plain text unchanged', () => {
    expect(stripHtml('no tags here')).toBe('no tags here');
  });

  it('should remove script tags and their content markers', () => {
    // Note: stripHtml removes tags, not content between them
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('should handle multiple tags in sequence', () => {
    expect(stripHtml('<p>one</p><p>two</p><p>three</p>')).toBe('onetwothree');
  });
});

describe('sanitizeInput', () => {
  it('should strip HTML and trim whitespace', () => {
    expect(sanitizeInput('  <b>Hello</b>  ')).toBe('Hello');
  });

  it('should trim leading whitespace', () => {
    expect(sanitizeInput('   leading')).toBe('leading');
  });

  it('should trim trailing whitespace', () => {
    expect(sanitizeInput('trailing   ')).toBe('trailing');
  });

  it('should handle string with only HTML', () => {
    expect(sanitizeInput('<br/><hr/>')).toBe('');
  });

  it('should handle string with only whitespace', () => {
    expect(sanitizeInput('   ')).toBe('');
  });

  it('should preserve inner whitespace', () => {
    expect(sanitizeInput('  hello   world  ')).toBe('hello   world');
  });
});

describe('sanitizeFilename', () => {
  it('should replace directory separators with underscores', () => {
    expect(sanitizeFilename('path/to/file.txt')).toBe('path_to_file.txt');
    expect(sanitizeFilename('path\\to\\file.txt')).toBe('path_to_file.txt');
  });

  it('should replace colons', () => {
    expect(sanitizeFilename('C:file.txt')).toBe('C_file.txt');
  });

  it('should replace asterisks', () => {
    expect(sanitizeFilename('file*.txt')).toBe('file_.txt');
  });

  it('should replace question marks', () => {
    expect(sanitizeFilename('file?.txt')).toBe('file_.txt');
  });

  it('should replace angle brackets', () => {
    expect(sanitizeFilename('<file>.txt')).toBe('_file_.txt');
  });

  it('should replace pipe characters', () => {
    expect(sanitizeFilename('file|name.txt')).toBe('file_name.txt');
  });

  it('should prevent path traversal with double dots', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('____etc_passwd');
  });

  it('should replace leading dot (hidden files)', () => {
    expect(sanitizeFilename('.htaccess')).toBe('_htaccess');
  });

  it('should trim whitespace', () => {
    expect(sanitizeFilename('  file.txt  ')).toBe('file.txt');
  });

  it('should handle normal filenames without changes', () => {
    expect(sanitizeFilename('report-2024.pdf')).toBe('report-2024.pdf');
  });

  it('should handle multiple special characters', () => {
    const result = sanitizeFilename('../<script>|"test"?.txt');
    expect(result).not.toContain('/');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
    expect(result).not.toContain('"');
    expect(result).not.toContain('?');
    expect(result).not.toContain('|');
    expect(result).not.toContain('..');
  });
});
