import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

describe('API Integration Tests', () => {
    beforeAll(async () => {
        // Run database migrations first
        await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);

        // Attempt to reset the database and seed it before tests
        const resetReq = new Request('http://localhost/api/v1/test/reset', {
            method: 'POST',
        });

        // We pass the test environment where TEST_MODE = 'true' is set by vitest.config.ts
        const ctx = createExecutionContext();
        const res = await worker.fetch(resetReq, testEnv, ctx);
        await waitOnExecutionContext(ctx);

        if (res.status !== 200) {
            console.error('Reset failed:', await res.text());
        }
        expect(res.status).toBe(200);
    });

    describe('Authentication API', () => {
        it('Should login test admin user', async () => {
            const loginReq = new Request('http://localhost/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@e2e.test',
                    password: 'password123',
                    tenantId: '00000000-0000-0000-0000-000000000000'
                }),
            });

            const ctx = createExecutionContext();
            const res = await worker.fetch(loginReq, env, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.success).toBe(true);
            expect(body.data).toHaveProperty('accessToken');
            expect(body.data.user).toHaveProperty('email', 'admin@e2e.test');
        });

        it('Should reject invalid credentials', async () => {
            const loginReq = new Request('http://localhost/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: 'admin@e2e.test',
                    password: 'wrongpassword',
                    tenantId: '00000000-0000-0000-0000-000000000000'
                }),
            });

            const ctx = createExecutionContext();
            const res = await worker.fetch(loginReq, testEnv, ctx);
            await waitOnExecutionContext(ctx);

            expect(res.status).toBe(401);
        });
    });
});
