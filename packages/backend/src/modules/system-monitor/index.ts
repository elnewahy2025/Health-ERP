import os from 'os';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';

interface SystemAlertRow {
  id: string;
  tenant_id: string;
  severity: string;
  source: string;
  message: string;
  metadata: unknown;
  is_acknowledged: boolean;
  acknowledged_at: Date | null;
  acknowledged_by: string | null;
  created_at: Date;
}

export async function registerSystemMonitorModule(app: FastifyInstance) {
  // ── System Health ──
  app.get('/api/v1/system/health', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const start = Date.now();
    let dbStatus = 'healthy';
    try {
      await db.raw('SELECT 1');
    } catch { dbStatus = 'unhealthy'; }

    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const memory = process.memoryUsage();
    const redisInfo: { status: string } = { status: 'unknown' };
    try {
      const { redis } = await import('../../core/redis.js');
      await redis.ping();
      redisInfo.status = 'connected';
    } catch { redisInfo.status = 'disconnected'; }

    return sendSuccess(reply, {
      status: dbStatus === 'healthy' && redisInfo.status === 'connected' ? 'healthy' : 'degraded',
      uptime: `${days}d ${hours}h`,
      database: { status: dbStatus, latency: `${Date.now() - start}ms` },
      redis: redisInfo,
      memory: {
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
      },
      platform: { node: process.version, arch: process.arch, platform: process.platform, cpus: os.cpus().length },
      timestamp: new Date().toISOString(),
    });
  });

  // ── System Metrics (record from tenant) ──
  app.post('/api/v1/system/metrics', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    await db('system_metrics').insert({
      tenant_id: tenantId, metric: body.metric, value: body.value || 0,
      labels: JSON.stringify(body.labels || {}),
    });

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'system.metric_recorded', entityType: 'system_metric',
      metadata: { metric: body.metric, value: body.value },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Metric recorded', 201);
  });

  app.get('/api/v1/system/metrics', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { metric, hours } = request.query as { hours?: string; metric?: string };
    const since = new Date(Date.now() - (Number(hours) || 24) * 3600000);
    let q = db('system_metrics').where({ tenant_id: tenantId }).where('recorded_at', '>=', since);
    if (metric) q = q.andWhere('metric', metric);
    const metrics = await q.orderBy('recorded_at', 'desc').limit(200);
    return sendSuccess(reply, metrics.map((m: Record<string, unknown>) => ({
      id: m.id, metric: m.metric, value: Number(m.value),
      labels: m.labels, recordedAt: m.recorded_at,
    })));
  });

  // ── Performance overview (recorded metrics) ──
  app.get('/api/v1/system/performance', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { hours } = request.query as { hours?: string };
    const since = new Date(Date.now() - (Number(hours) || 24) * 3600000);

    const apiLatency = await db('system_metrics').where({ tenant_id: tenantId, metric: 'api_latency_ms' })
      .where('recorded_at', '>=', since).avg('value as avg').max('value as max').first();
    const requestCount = await db('system_metrics').where({ tenant_id: tenantId, metric: 'api_requests' })
      .where('recorded_at', '>=', since).sum('value as total').first();
    const errorRate = await db('system_metrics').where({ tenant_id: tenantId, metric: 'api_errors' })
      .where('recorded_at', '>=', since).sum('value as total').first();
    const dbLatency = await db('system_metrics').where({ tenant_id: tenantId, metric: 'db_query_ms' })
      .where('recorded_at', '>=', since).avg('value as avg').first();

    return sendSuccess(reply, {
      apiLatency: { avg: Number((apiLatency as Record<string, unknown>)?.avg || 0).toFixed(2), max: Number((apiLatency as Record<string, unknown>)?.max || 0).toFixed(2) },
      requestCount: Number((requestCount as Record<string, unknown>)?.total || 0),
      errorRate: Number((errorRate as Record<string, unknown>)?.total || 0),
      dbLatency: { avg: Number((dbLatency as Record<string, unknown>)?.avg || 0).toFixed(2) },
      period: `${hours || 24}h`,
    });
  });

  // ── Alerts ──
  app.get('/api/v1/system/alerts', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { severity, acknowledged } = request.query as { acknowledged?: string; severity?: string };
    let q = db('system_alerts').where('system_alerts.tenant_id', tenantId);
    if (severity) q = q.andWhere('severity', severity);
    if (acknowledged === 'false') q = q.andWhere('is_acknowledged', false);
    const alerts = await q.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, alerts.map((a: SystemAlertRow) => ({
      id: a.id, severity: a.severity, source: a.source, message: a.message,
      metadata: a.metadata, isAcknowledged: a.is_acknowledged,
      acknowledgedAt: a.acknowledged_at, acknowledgedBy: a.acknowledged_by, createdAt: a.created_at,
    })));
  });

  app.post('/api/v1/system/alerts', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [alert] = await db('system_alerts').insert({
      tenant_id: tenantId, severity: body.severity || 'info',
      source: body.source, message: body.message,
      metadata: JSON.stringify(body.metadata || {}),
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'system.alert_created', entityType: 'system_alert', entityId: alert.id,
      metadata: { severity: body.severity, source: body.source, message: body.message },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: alert.id }, 'Alert created', 201);
  });

  app.put('/api/v1/system/alerts/:id/acknowledge', { preHandler: [authenticate, authorize('system_monitor.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    await db('system_alerts').where({ id, tenant_id: tenantId }).update({
      is_acknowledged: true, acknowledged_at: new Date(), acknowledged_by: ctx.userId,
    });

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'system.alert_acknowledged', entityType: 'system_alert', entityId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Alert acknowledged');
  });

  // ── Tenant storage stats ──
  app.get('/api/v1/system/storage', { preHandler: [authenticate, authorize('system_monitor.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const tables = ['patients', 'appointments', 'emr_records', 'invoices', 'lab_orders', 'pharmacy_prescriptions', 'employees', 'documents'];
    const stats: Array<Record<string, unknown>> = [];
    for (const table of tables) {
      try {
        const count = await db(table).where({ tenant_id: tenantId }).count('id as c').first();
        stats.push({ table, recordCount: Number(count?.c || 0) });
      } catch { stats.push({ table, recordCount: 0 }); }
    }
    return sendSuccess(reply, stats);
  });

  // ── Audit Log Explorer ──
  app.get('/api/v1/system/audit-log', { preHandler: [authenticate, authorize('audit.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { action, entity, days } = request.query as { action?: string; days?: string; entity?: string };
    const since = new Date(Date.now() - (Number(days) || 7) * 86400000);
    let q = db('audit_logs').where('audit_logs.tenant_id', tenantId).where('created_at', '>=', since);
    if (action) q = q.andWhere('action', action);
    if (entity) q = q.andWhere('entity_type', entity);
    const logs = await q.orderBy('created_at', 'desc').limit(100);
    return sendSuccess(reply, logs.map((l: Record<string, unknown>) => ({
      id: l.id, action: l.action, entityType: l.entity_type, entityId: l.entity_id,
      userId: l.user_id, metadata: l.metadata, ipAddress: l.ip_address, createdAt: l.created_at,
    })));
  });
}
