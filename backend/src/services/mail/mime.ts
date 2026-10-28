/**
 * A small MIME reader for inbound mail (R131): headers, text/plain and text/html parts, with transfer decoding
 * (base64, quoted-printable) and charset decoding. No attachments are kept. No dependencies.
 */

export interface ParsedMail {
  headers: Map<string, string>;
  subject: string;
  text: string;
  html: string;
  attachmentCount: number;
}

const MAX_DEPTH = 6;
const MAX_PARTS = 40;

/** Bytes as a "binary string" (one char per byte), so the structure can be split with plain string operations. */
function toBinary(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return out;
}

function fromBinary(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function parseHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}\n${value}` : value);
  }
  return headers;
}

function splitHeadBody(raw: string): { head: string; body: string } {
  const m = raw.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return { head: raw, body: '' };
  return { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) };
}

/** Parameter of a structured header value: `text/plain; charset="utf-8"` -> param('charset'). */
function param(value: string, name: string): string {
  const m = value.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, 'i'));
  return m ? (m[1] ?? m[2] ?? '') : '';
}

function decodeQuotedPrintable(s: string): Uint8Array {
  const joined = s.replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) {
      out.push(parseInt(joined.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(joined.charCodeAt(i) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function decodeBody(body: string, encoding: string, charset: string): string {
  let bytes: Uint8Array;
  switch (encoding.toLowerCase()) {
    case 'base64':
      try {
        bytes = fromBinary(atob(body.replace(/[^A-Za-z0-9+/=]/g, '')));
      } catch {
        bytes = fromBinary(body);
      }
      break;
    case 'quoted-printable':
      bytes = decodeQuotedPrintable(body);
      break;
    default:
      bytes = fromBinary(body);
  }
  return decodeCharset(bytes, charset);
}

/** RFC 2047 encoded words (=?utf-8?B?...?=) in a header such as Subject. */
export function decodeEncodedWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, text: string) => {
      try {
        if (enc.toLowerCase() === 'b') return decodeCharset(fromBinary(atob(text)), charset);
        return decodeCharset(decodeQuotedPrintable(text.replace(/_/g, ' ')), charset);
      } catch {
        return text;
      }
    });
}

interface Acc {
  text: string[];
  html: string[];
  attachments: number;
  parts: number;
}

function walk(raw: string, acc: Acc, depth: number): Map<string, string> {
  const { head, body } = splitHeadBody(raw);
  const headers = parseHeaders(head);
  if (++acc.parts > MAX_PARTS || depth > MAX_DEPTH) return headers;
  const type = (headers.get('content-type') ?? 'text/plain').toLowerCase();
  const disposition = (headers.get('content-disposition') ?? '').toLowerCase();
  const encoding = headers.get('content-transfer-encoding') ?? '7bit';

  if (type.startsWith('multipart/')) {
    const boundary = param(headers.get('content-type') ?? '', 'boundary');
    if (!boundary) return headers;
    const marker = `--${boundary}`;
    const segments = body.split(marker);
    for (const seg of segments.slice(1)) {
      if (seg.startsWith('--')) break;
      walk(seg.replace(/^\r?\n/, ''), acc, depth + 1);
    }
    return headers;
  }
  if (disposition.startsWith('attachment')) {
    acc.attachments++;
    return headers;
  }
  const charset = param(headers.get('content-type') ?? '', 'charset');
  if (type.startsWith('text/plain')) acc.text.push(decodeBody(body, encoding, charset));
  else if (type.startsWith('text/html')) acc.html.push(decodeBody(body, encoding, charset));
  else if (!type.startsWith('message/')) acc.attachments++;
  return headers;
}

export function parseMime(raw: Uint8Array): ParsedMail {
  const acc: Acc = { text: [], html: [], attachments: 0, parts: 0 };
  const headers = walk(toBinary(raw), acc, 0);
  return {
    headers,
    subject: decodeEncodedWords(headers.get('subject') ?? '').trim(),
    text: acc.text.join('\n').trim(),
    html: acc.html.join('\n').trim(),
    attachmentCount: acc.attachments,
  };
}

/** Plain text from an HTML body (for mail that has no text part). */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Drop the quoted history below a reply: "On ... wrote:", "Original Message", Outlook header blocks, ">" lines. */
export function stripQuotedHistory(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();
    const attribution = /^On .{5,200}wrote:\s*$/i.test(line) || (/^On .{5,200}$/i.test(line) && /wrote:\s*$/i.test(next));
    const original = /^-{2,}\s*(Original Message|Forwarded message)\s*-{2,}$/i.test(line) || /^_{10,}$/.test(line);
    const outlook = /^From:\s.+/i.test(line) && /^(Sent|Date):\s/i.test(next);
    const quotedBlock = line.startsWith('>') && i > 0;
    if (attribution || original || outlook || quotedBlock) {
      cut = i;
      break;
    }
  }
  const kept = lines.slice(0, cut).join('\n').trim();
  return kept || text.trim();
}
