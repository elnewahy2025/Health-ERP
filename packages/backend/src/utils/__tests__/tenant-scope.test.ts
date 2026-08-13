import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/database.js', () => ({
  db: vi.fn(),
}));

import { db } from '../../core/database.js';
import { findTenantRow } from '../tenant-scope.js';

describe('findTenantRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the lookup by id and tenant_id', async () => {
    const first = vi.fn().mockResolvedValue({ id: 'r1', tenant_id: 't1' });
    const where = vi.fn(() => ({ first }));
    (db as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ where });

    const row = await findTenantRow('patients', 'r1', 't1');

    expect(row).toEqual({ id: 'r1', tenant_id: 't1' });
    expect(db).toHaveBeenCalledWith('patients');
    expect(where).toHaveBeenCalledWith({ id: 'r1', tenant_id: 't1' });
  });

  it('returns undefined when the row does not exist or belongs to another tenant', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const where = vi.fn(() => ({ first }));
    (db as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ where });

    const row = await findTenantRow('patients', 'r1', 't2');

    expect(row).toBeUndefined();
    expect(where).toHaveBeenCalledWith({ id: 'r1', tenant_id: 't2' });
  });
});
