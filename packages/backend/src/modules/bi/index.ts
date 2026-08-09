import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { DashboardWidgetRow } from "../types.js";

export async function registerBiModule(app: FastifyInstance) {
  // ── Dashboard Definitions ──
  app.get('/api/v1/bi/dashboards', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { category } = request.query as { category?: string };
    let q = db('dashboard_definitions').where('dashboard_definitions.tenant_id', tenantId);
    if (category) q = q.andWhere('category', category);
    const dashboards = await q.orderBy('name');
    return sendSuccess(reply, dashboards.map((d: Record<string, unknown>) => ({
      id: d.id, name: d.name, slug: d.slug, category: d.category,
      description: d.description, layout: d.layout,
      isDefault: d.is_default, refreshInterval: d.refresh_interval,
      createdAt: d.created_at, updatedAt: d.updated_at
    })));
  });

  app.post('/api/v1/bi/dashboards', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const slug = body.slug || (body.name as string).toLowerCase().replace(/\s+/g, '_');
    const [d] = await db('dashboard_definitions').insert({
      tenant_id: tenantId, name: body.name, slug, category: body.category || 'executive',
      description: body.description || null, layout: JSON.stringify(body.layout || []),
      refresh_interval: body.refreshInterval || '5m', created_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: d.id, name: d.name, slug: d.slug }, 'Dashboard created', 201);
  });

  app.put('/api/v1/bi/dashboards/:id', { preHandler: [authenticate, authorize('bi.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name; if (body.description !== undefined) update.description = body.description;
    if (body.layout) update.layout = JSON.stringify(body.layout);
    if (body.refreshInterval) update.refresh_interval = body.refreshInterval;
    if (body.isDefault !== undefined) update.is_default = body.isDefault;
    await db('dashboard_definitions').where({ id }).update(update);
    return sendSuccess(reply, null, 'Dashboard updated');
  });

  app.delete('/api/v1/bi/dashboards/:id', { preHandler: [authenticate, authorize('bi.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db('dashboard_widgets').where({ dashboard_id: id }).del();
    await db('dashboard_definitions').where({ id }).del();
    return sendSuccess(reply, null, 'Dashboard deleted');
  });

  // ── Widgets ──
  app.get('/api/v1/bi/dashboards/:id/widgets', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const widgets = await db('dashboard_widgets').where({ tenant_id: tenantId, dashboard_id: id }).orderBy('position_y').orderBy('position_x');
    return sendSuccess(reply, widgets.map((w: Record<string, unknown>) => ({
      id: w.id, title: w.title, widgetType: w.widget_type,
      dataSource: w.data_source, config: w.config, query: w.query,
      width: w.width, height: w.height, positionX: w.position_x, positionY: w.position_y
    })));
  });

  app.post('/api/v1/bi/dashboards/:id/widgets', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const [w] = await db('dashboard_widgets').insert({
      tenant_id: tenantId, dashboard_id: id, title: body.title,
      widget_type: body.widgetType || 'kpi', data_source: body.dataSource || 'appointments',
      config: JSON.stringify(body.config || {}), query: JSON.stringify(body.query || {}),
      width: body.width || 4, height: body.height || 2,
      position_x: body.positionX || 0, position_y: body.positionY || 0
    }).returning('*');
    return sendSuccess(reply, { id: w.id, title: w.title }, 'Widget added', 201);
  });

  app.put('/api/v1/bi/widgets/:id', { preHandler: [authenticate, authorize('bi.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.title) update.title = body.title; if (body.config) update.config = JSON.stringify(body.config);
    if (body.query) update.query = JSON.stringify(body.query);
    if (body.width) update.width = body.width; if (body.height) update.height = body.height;
    if (body.positionX !== undefined) update.position_x = body.positionX;
    if (body.positionY !== undefined) update.position_y = body.positionY;
    await db('dashboard_widgets').where({ id }).update(update);
    return sendSuccess(reply, null, 'Widget updated');
  });

  app.delete('/api/v1/bi/widgets/:id', { preHandler: [authenticate, authorize('bi.edit')] }, async (request, reply) => {
    await db('dashboard_widgets').where({ id: (request.params as { id: string }).id }).del();
    return sendSuccess(reply, null, 'Widget deleted');
  });

  // ── KPI Data Endpoints ──
  app.get('/api/v1/bi/kpi/appointments', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const total = await db('appointments').where({ tenant_id: tenantId }).count('id as c').first();
    const today = await db('appointments').where({ tenant_id: tenantId }).whereRaw('DATE(created_at) = CURRENT_DATE').count('id as c').first();
    const byStatus = await db('appointments').where({ tenant_id: tenantId }).select('status').groupBy('status').count('id as count');
    return sendSuccess(reply, { total: Number((total as Record<string, unknown>)?.c || 0), today: Number((today as Record<string, unknown>)?.c || 0), byStatus });
  });

  app.get('/api/v1/bi/kpi/revenue', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000);
    const total = await db('payment_transactions').where({ tenant_id: tenantId }).sum('amount as total').first();
    const recent = await db('payment_transactions').where({ tenant_id: tenantId }).where('created_at', '>=', since).sum('amount as total').first();
    const byMethod = await db('payment_transactions').where({ tenant_id: tenantId }).select('payment_method').groupBy('payment_method').sum('amount as total');
    return sendSuccess(reply, { total: Number((total as Record<string, unknown>)?.total || 0), recent: Number((recent as Record<string, unknown>)?.total || 0), byMethod });
  });

  app.get('/api/v1/bi/kpi/patients', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const total = await db('patients').where({ tenant_id: tenantId }).whereNull('deleted_at').count('id as c').first();
    const newThisMonth = await db('patients').where({ tenant_id: tenantId }).whereRaw("DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)").count('id as c').first();
    return sendSuccess(reply, { total: Number((total as Record<string, unknown>)?.c || 0), newThisMonth: Number((newThisMonth as Record<string, unknown>)?.c || 0) });
  });

  app.get('/api/v1/bi/kpi/clinical', { preHandler: [authenticate, authorize('bi.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { days } = request.query as { days?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000);
    const labOrders = await db('lab_orders').where({ tenant_id: tenantId }).where('created_at', '>=', since).count('id as c').first();
    const radiologyOrders = await db('radiology_orders').where({ tenant_id: tenantId }).where('created_at', '>=', since).count('id as c').first();
    const prescriptions = await db('pharmacy_prescriptions').where({ tenant_id: tenantId }).where('created_at', '>=', since).count('id as c').first();
    return sendSuccess(reply, {
      labOrders: Number((labOrders as Record<string, unknown>)?.c || 0),
      radiologyOrders: Number((radiologyOrders as Record<string, unknown>)?.c || 0),
      prescriptions: Number((prescriptions as Record<string, unknown>)?.c || 0)
    });
  });
}
