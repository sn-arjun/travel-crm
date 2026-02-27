import { KVNamespace } from '@cloudflare/workers-types';
import { ReportResult } from '../types/report';

export class ReportCache {
    constructor(private kv: KVNamespace) { }

    private async getCacheKey(tenantId: string, reportId: string, params: Record<string, any>): Promise<string> {
        // Sort params to ensure consistency regardless of key order
        const sorted = JSON.stringify(params, Object.keys(params).sort());

        // Hash the params
        const encoder = new TextEncoder();
        const data = encoder.encode(sorted);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return `report:${tenantId}:${reportId}:${hashHex}`;
    }

    async get(tenantId: string, reportId: string, params: Record<string, any>): Promise<ReportResult | null> {
        const key = await this.getCacheKey(tenantId, reportId, params);
        const cached = await this.kv.get(key, 'json');
        return cached as ReportResult | null;
    }

    async set(tenantId: string, reportId: string, params: Record<string, any>, result: ReportResult): Promise<void> {
        const key = await this.getCacheKey(tenantId, reportId, params);

        // KV limit is 25MB per entry. 
        // Data is large, but usually a paginated report result is well within limits.
        await this.kv.put(key, JSON.stringify({
            ...result,
            cached_at: new Date().toISOString()
        }), {
            expirationTtl: 300, // 5 minutes TTL
        });
    }

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
