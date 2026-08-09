import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { NotificationPreferenceRow, EmployeeRow } from "../types.js";

export async function registerUserPreferencesModule(app: FastifyInstance) {
  // ── User Settings ──
  app.get('/api/v1/user/settings', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    let settings = await db('user_settings').where({ tenant_id: tenantId, user_id: ctx.userId }).first();
    if (!settings) {
      return sendSuccess(reply, {
        theme: 'light', shortcuts: [], dashboardConfig: {},
        itemsPerPage: 25, dateFormat: 'YYYY-MM-DD', timeFormat: 'HH:mm',
        timezone: null, quickSearchEnabled: true
      });
    }
    return sendSuccess(reply, {
      id: settings.id, theme: settings.theme, shortcuts: settings.shortcuts,
      dashboardConfig: settings.dashboard_config,
      itemsPerPage: settings.items_per_page, dateFormat: settings.date_format,
      timeFormat: settings.time_format, timezone: settings.timezone,
      quickSearchEnabled: settings.quick_search_enabled
    });
  });

  app.put('/api/v1/user/settings', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const existing = await db('user_settings').where({ tenant_id: tenantId, user_id: ctx.userId }).first();
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.theme) update.theme = body.theme;
    if (body.shortcuts) update.shortcuts = JSON.stringify(body.shortcuts);
    if (body.dashboardConfig) update.dashboard_config = JSON.stringify(body.dashboardConfig);
    if (body.itemsPerPage) update.items_per_page = body.itemsPerPage;
    if (body.dateFormat) update.date_format = body.dateFormat;
    if (body.timeFormat) update.time_format = body.timeFormat;
    if (body.timezone !== undefined) update.timezone = body.timezone;
    if (body.quickSearchEnabled !== undefined) update.quick_search_enabled = body.quickSearchEnabled;

    if (existing) {
      await db('user_settings').where({ id: existing.id }).update(update);
    } else {
      await db('user_settings').insert({ tenant_id: tenantId, user_id: ctx.userId, ...update });
    }
    return sendSuccess(reply, null, 'Settings saved');
  });

  // ── Notification Preferences ──
  app.get('/api/v1/user/notification-preferences', { preHandler: [authenticate, authorize('notifications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const prefs = await db('notification_preferences').where({ tenant_id: tenantId, user_id: ctx.userId }).orderBy('channel');
    return sendSuccess(reply, prefs.map((p: Record<string, unknown>) => ({
      id: p.id, channel: p.channel, events: p.events, isEnabled: p.is_enabled
    })));
  });

  app.put('/api/v1/user/notification-preferences/:channel', { preHandler: [authenticate, authorize('notifications.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const { channel } = request.params as { channel: string }; const body = request.body as Record<string, unknown>;
    const existing = await db('notification_preferences').where({ tenant_id: tenantId, user_id: ctx.userId, channel }).first();
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (body.events) data.events = JSON.stringify(body.events);
    if (body.isEnabled !== undefined) data.is_enabled = body.isEnabled;
    if (existing) {
      await db('notification_preferences').where({ id: existing.id }).update(data);
    } else {
      await db('notification_preferences').insert({ tenant_id: tenantId, user_id: ctx.userId, channel, ...data });
    }
    return sendSuccess(reply, null, 'Notification preferences updated');
  });

  // ── Quick Search endpoint ──
  app.get('/api/v1/search', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { q } = request.query as { q?: string };
    if (!q || q.length < 2) return sendSuccess(reply, []);

    const term = `%${q}%`;
    const [patients, appointments, employees] = await Promise.all([
      db('patients').where({ tenant_id: tenantId }).whereNull('deleted_at')
        .where(function() { this.where('first_name', 'ilike', term).orWhere('last_name', 'ilike', term).orWhere('phone', 'ilike', term).orWhere('medical_record_number', 'ilike', term); })
        .select('id', 'first_name', 'last_name', 'medical_record_number', 'phone').limit(5),
      db('appointments').where({ tenant_id: tenantId }).whereNull('deleted_at')
        .where('appointment_date', '>=', new Date().toISOString().split('T')[0])
        .join('patients', 'appointments.patient_id', 'patients.id')
        .where(function() { this.where('patients.first_name', 'ilike', term).orWhere('patients.last_name', 'ilike', term); })
        .select('appointments.id', 'appointments.appointment_date', 'appointments.start_time', 'appointments.status', 'patients.first_name as pf', 'patients.last_name as pl').limit(5),
      db('employees').where({ tenant_id: tenantId }).whereNull('deleted_at')
        .where(function() { this.where('first_name', 'ilike', term).orWhere('last_name', 'ilike', term).orWhere('email', 'ilike', term); })
        .select('id', 'first_name', 'last_name', 'department', 'position').limit(5),
    ]);

    return sendSuccess(reply, {
      patients: patients.map((p: Record<string, unknown>) => ({ type: 'patient', id: p.id, label: `${p.first_name} ${p.last_name}`, subtitle: p.medical_record_number || p.phone, link: `/patients/${p.id}` })),
      appointments: appointments.map((a: Record<string, unknown>) => ({ type: 'appointment', id: a.id, label: `${a.pf} ${a.pl}`, subtitle: `${a.appointment_date} ${a.start_time || ''}`, link: `/appointments` })),
      employees: employees.map((e: Record<string, unknown>) => ({ type: 'employee', id: e.id, label: `${e.first_name} ${e.last_name}`, subtitle: `${e.department || ''} · ${e.position || ''}`, link: `/hr` })),
    });
  });

  // ── Default keyboard shortcuts ──
  app.get('/api/v1/user/shortcuts', async (request, reply) => {
    return sendSuccess(reply, [
      { key: 'g d', label: 'Go to Dashboard', category: 'navigation' },
      { key: 'g p', label: 'Go to Patients', category: 'navigation' },
      { key: 'g a', label: 'Go to Appointments', category: 'navigation' },
      { key: 'g b', label: 'Go to Billing', category: 'navigation' },
      { key: '/', label: 'Open Quick Search', category: 'search' },
      { key: 'n', label: 'New (context-dependent)', category: 'actions' },
      { key: '?', label: 'Show Keyboard Shortcuts', category: 'help' },
      { key: 't', label: 'Toggle Theme', category: 'appearance' },
    ]);
  });
}
