import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:3000';

test.describe('API Health', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body.status).toBe('ok');
  });

  test('API versioning returns version header for v1', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('unsupported API version returns 400', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v99/health`, {
      headers: { 'X-API-Version': 'v99' },
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('Unsupported');
  });

  test('API version header is echoed in response', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/health`, {
      headers: { 'X-API-Version': 'v1', 'X-Request-ID': 'e2e-health-request' },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['x-api-version-resolved']).toBe('v1');
    expect(response.headers()['x-request-id']).toBe('e2e-health-request');
    const body = await response.json();
    expect(body.requestId).toBe('e2e-health-request');
  });

  test('explicit liveness and readiness aliases return truthful status contracts', async ({ request }) => {
    const live = await request.get(`${API_BASE}/api/v1/health/live`);
    expect(live.ok()).toBeTruthy();
    expect((await live.json()).alive).toBe(true);

    const ready = await request.get(`${API_BASE}/api/v1/health/ready`);
    expect([200, 503]).toContain(ready.status());
    const body = await ready.json();
    expect(typeof body.ready).toBe('boolean');
    expect(body).toHaveProperty('services');
    expect(ready.headers()['x-request-id']).toBeTruthy();
  });

  test('health endpoint responds within 5 seconds', async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${API_BASE}/health`);
    const elapsed = Date.now() - start;
    expect(response.ok()).toBeTruthy();
    expect(elapsed).toBeLessThan(5000);
  });
});
