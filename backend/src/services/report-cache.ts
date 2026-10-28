import { KVNamespace } from '@cloudflare/workers-types';
import { ReportResult } from '../types/report';
import { OWNER_FILTERED_ROLES } from './report-engine';

/**
 * Cache scope for a caller: roles whose report rows are filtered by owner get role AND userId; all other
 * roles see tenant-wide data, so the role alone is enough.
 */
export function reportCacheScope(role: string, userId: string): string {
    return (OWNER_FILTERED_ROLES as readonly string[]).includes(role) ? `${role}:${userId}` : role;
}

export class ReportCache {
    constructor(private kv: KVNamespace) { }

    /**
     * `scope` is the data-visibility scope of the caller (see `reportCacheScope`). It is part of the key so a
     * result computed for one visibility level (e.g. an admin's tenant-wide data) is never served to another
     * (e.g. a salesperson who only sees their own records).
     */
    private async getCacheKey(tenantId: string, reportId: string, params: Record<string, any>, scope: string): Promise<string> {
        // Sort params to ensure consistency regardless of key order
        const sorted = JSON.stringify(params, Object.keys(params).sort());

        // Hash the params
        const encoder = new TextEncoder();
        const data = encoder.encode(sorted);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `report:${tenantId}:${reportId}:${encodeURIComponent(scope)}:${hashHex}`;
    }

    async get(tenantId: string, reportId: string, params: Record<string, any>, scope: string): Promise<ReportResult | null> {
        const key = await this.getCacheKey(tenantId, reportId, params, scope);
        const cached = await this.kv.get(key, 'json');
        return cached as ReportResult | null;
    }

    async set(tenantId: string, reportId: string, params: Record<string, any>, scope: string, result: ReportResult): Promise<void> {
        const key = await this.getCacheKey(tenantId, reportId, params, scope);

        // KV limit is 25MB per entry. 
        // Data is large, but usually a paginated report result is well within limits.
        await this.kv.put(key, JSON.stringify({
            ...result,
            cached_at: new Date().toISOString()
        }), {
            expirationTtl: 300, // 5 minutes TTL
        });
    }

    /** Prefix-based: removes every scope's entries for the tenant (or for one report). */
    async invalidate(tenantId: string, reportId?: string): Promise<void> {
        const prefix = reportId ? `report:${tenantId}:${reportId}:` : `report:${tenantId}:`;

        // KV list and delete
        let cursor: string | undefined;

        do {
            const keys = await this.kv.list({ prefix, cursor });

            const deletePromises = keys.keys.map(key => this.kv.delete(key.name));
            await Promise.all(deletePromises);

            cursor = keys.list_complete ? undefined : keys.cursor;
        } while (cursor);
    }
}
