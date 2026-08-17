import { describe, expect, it } from 'vitest';
import { buildAccessTokenPayload, summarizeDevice } from '../auth.service.js';

describe('membership-bound access-token payloads', () => {
  it('binds access tokens to the selected membership and persistent session', () => {
    const payload = buildAccessTokenPayload(
      'tenant-a',
      'user-a',
      'membership-a',
      'session-a',
    );
    expect(payload).toMatchObject({
      tenantId: 'tenant-a',
      userId: 'user-a',
      user_id: 'user-a',
      active_membership_id: 'membership-a',
      session_id: 'session-a',
    });
  });

  it('does not invent membership or session claims for legacy callers', () => {
    const payload = buildAccessTokenPayload('tenant-a', 'user-a');
    expect(payload).toEqual({ tenantId: 'tenant-a', userId: 'user-a', user_id: 'user-a' });
    expect(payload).not.toHaveProperty('active_membership_id');
    expect(payload).not.toHaveProperty('session_id');
  });

  it('normalizes device metadata without trusting arbitrary user-agent text', () => {
    expect(summarizeDevice('Mozilla/5.0 Chrome/120.0 (X11; Linux x86_64)')).toBe('Chrome · Desktop');
    expect(summarizeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/120.0')).toBe('Chrome · iOS');
    expect(summarizeDevice(null)).toBe('Unknown device');
  });
});
