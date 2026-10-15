import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { PRIVACY_TABLES, bindsFor, type PrivacyTable } from './registry';
import { signMessage } from '../../utils/unsubscribe-token';

/** Short-lived download: the signed link works for this long. */
export const PRIVACY_EXPORT_TTL_SECONDS = 15 * 60;

/** The R2 key a stored reference points at, when it is one of this tenant's objects; otherwise null. */
export function tenantKeyFromRef(ref: unknown, tenantId: string): string | null {
  if (typeof ref !== 'string' || !ref) return null;
  let candidate = ref;
  const idx = candidate.indexOf('/files/');
  if (idx >= 0) {
    try {
      candidate = decodeURIComponent(candidate.slice(idx + '/files/'.length).split('?')[0]);
    } catch {
      return null;
    }
  }
  if (candidate.startsWith('/') || candidate.includes('..')) return null;
  return candidate.startsWith(`${tenantId}/`) ? candidate : null;
}

export interface ContactExportFile {
  table: string;
  column: string;
  key: string;
  size: number | null;
  contentType: string | null;
}

export interface ContactExport {
  exportedAt: string;
  contactId: string;
  format: 'travelcrm-contact-export/1';
  tables: Record<string, Record<string, unknown>[]>;
  files: ContactExportFile[];
}

/** Reads every row the registry finds for the contact (and the R2 objects they point at). Read-only. */
export async function buildContactExport(
  env: Pick<Env, 'FILE_STORAGE'>,
  db: D1Database,
  tenantId: string,
  contactId: string
): Promise<ContactExport> {
  const tables: ContactExport['tables'] = {};
  const files: ContactExportFile[] = [];

  for (const spec of PRIVACY_TABLES) {
    const rows = await readRows(db, spec, contactId);
    tables[spec.key] = rows;
    for (const row of rows) {
      for (const column of spec.fileColumns ?? []) {
        const key = tenantKeyFromRef(row[column], tenantId);
        if (!key) continue;
        const head = await env.FILE_STORAGE.head(key).catch(() => null);
        files.push({ table: spec.table, column, key, size: head?.size ?? null, contentType: head?.httpMetadata?.contentType ?? null });
      }
    }
  }

  return { exportedAt: new Date().toISOString(), contactId, format: 'travelcrm-contact-export/1', tables, files };
}

async function readRows(db: D1Database, spec: PrivacyTable, contactId: string): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(`SELECT * FROM ${spec.table} WHERE ${spec.where}`)
    .bind(...bindsFor(spec.where, contactId))
    .all<Record<string, unknown>>();
  const omit = new Set(spec.omit ?? []);
  return (results ?? []).map((row) => {
    if (omit.size === 0) return row;
    const copy = { ...row };
    for (const col of omit) delete copy[col];
    return copy;
  });
}

/** Stores the export under `${tenantId}/privacy/${contactId}/...` and returns a signed, short-lived download path. */
export async function storeContactExport(
  env: Env,
  tenantId: string,
  contactId: string,
  bundle: ContactExport
): Promise<{ key: string; downloadPath: string; expiresAt: string; summary: Record<string, number>; fileCount: number }> {
  const key = `${tenantId}/privacy/${contactId}/${generateId()}.json`;
  await env.FILE_STORAGE.put(key, JSON.stringify(bundle, null, 2), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { contactId, kind: 'privacy-export' },
  });
  const exp = Math.floor(Date.now() / 1000) + PRIVACY_EXPORT_TTL_SECONDS;
  const sig = await signMessage(env, `privacy-download|${key}|${exp}`);
  const summary: Record<string, number> = {};
  for (const [name, rows] of Object.entries(bundle.tables)) if (rows.length > 0) summary[name] = rows.length;
  return {
    key,
    downloadPath: `/api/v1/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
    summary,
    fileCount: bundle.files.length,
  };
}

/** True when `sig` is the signature issued by storeContactExport for this key and `exp` is still in the future. */
export async function verifyPrivacyDownload(env: Env, key: string, exp: string | undefined, sig: string | undefined): Promise<boolean> {
  const expNum = Number(exp);
  if (!sig || !Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) return false;
  const expected = await signMessage(env, `privacy-download|${key}|${expNum}`);
  return expected.length === sig.length && expected === sig;
}
