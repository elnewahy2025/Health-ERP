import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { sendNotification } from '../../services/notification.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerCommunicationsModule(app: FastifyInstance) {

  // List notification templates
  app.get('/api/v1/notification-templates', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const templates = await db('notification_templates')
      .where(function () { this.whereNull('tenant_id').orWhere('tenant_id', tenantId); })
      .orderBy('key');
    return sendSuccess(reply, templates);
  });

  // Update a notification template (tenant-specific override)
  app.put('/api/v1/notification-templates/:id', { preHandler: [authenticate, authorize('communications.edit')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { subject, body, isActive } = z.object({
      subject: z.string().optional(), body: z.string(), isActive: z.boolean().optional(),
    }).parse(request.body);

    const existing = await db('notification_templates').where({ id }).first();
    if (!existing) return reply.code(404).send({ error: 'Template not found' });
    if (existing.tenant_id && existing.tenant_id !== tenantId) return reply.code(403).send({ error: 'Forbidden' });

    const update: Record<string, unknown> = { body, updated_at: new Date() };
    if (subject !== undefined) update.subject = subject;
    if (isActive !== undefined) update.is_active = isActive;

    await db('notification_templates').where({ id }).update(update);
    return sendSuccess(reply, { message: 'Template updated' });
  });

  // Create a custom template (tenant-specific)
  app.post('/api/v1/notification-templates', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const body = z.object({
      key: z.string().min(2).max(100), channel: z.enum(['email', 'sms', 'both']),
      locale: z.enum(['en', 'ar']).default('en'),
      subject: z.string().optional(), body: z.string(),
    }).parse(request.body);

    const [template] = await db('notification_templates').insert({
      tenant_id: tenantId, key: body.key, channel: body.channel,
      locale: body.locale, subject: body.subject || null, body: body.body, is_active: true,
    }).returning('*');

    return sendSuccess(reply, template, 'Template created', 201);
  });

  // Send test notification
  app.post('/api/v1/notification-templates/:id/test', { preHandler: [authenticate, authorize('communications.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { recipient } = z.object({ recipient: z.string() }).parse(request.body);

    const template = await db('notification_templates').where({ id }).first();
    if (!template) return reply.code(404).send({ error: 'Template not found' });

    const sent = await sendNotification({
      tenantId, channel: template.channel as 'email' | 'sms',
      recipient, templateKey: template.key,
      variables: { testName: 'Test User', date: new Date().toLocaleDateString(), time: new Date().toLocaleTimeString() },
      locale: template.locale,
    });

    return sendSuccess(reply, { sent, message: sent ? 'Test sent successfully' : 'Failed to send test' });
  });

  // List notification logs
  app.get('/api/v1/notification-logs', { preHandler: [authenticate, authorize('notifications.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({ page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20) }).parse(request.query);

    const total = await db('notification_logs').where({ tenant_id: tenantId }).count('id as count').first();
    const logs = await db('notification_logs').where({ tenant_id: tenantId })
      .orderBy('created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);

    return sendPaginated(reply, logs, Number((total as Record<string, unknown>)?.count || 0), query.page, query.limit);
  });
}
