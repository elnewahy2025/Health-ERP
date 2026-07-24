import { db } from '../core/database.js';

interface AuditEntry {
  tenantId: string;
  userId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string | null;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db('audit_logs').insert({
      tenant_id: entry.tenantId,
      user_id: entry.userId || null,
      action: entry.action,
      entity_type: entry.entityType || null,
      entity_id: entry.entityId || null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent ? String(entry.userAgent).substring(0, 500) : null,
    });
  } catch (error) {
    console.error('✗ Audit log failed:', error);
    // Don't throw — audit should never break the main flow
  }
}
