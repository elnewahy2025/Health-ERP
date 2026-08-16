import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerWhatsAppModule(app: FastifyInstance) {

  // List messages
  app.get('/api/v1/whatsapp/messages', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { page = 1, limit = 20, status } = request.query as { page?: number; limit?: number; status?: string };
    let q = db('whatsapp_messages').where('whatsapp_messages.tenant_id', tenantId);
    if (status) q = q.andWhere('whatsapp_messages.status', status);
    const total = await q.clone().count('id as c').first();
    const messages = await q.orderBy('created_at', 'desc').limit(Number(limit)).offset((Number(page) - 1) * Number(limit));
    return sendPaginated(reply, messages, Number(total?.c || 0), Number(page), Number(limit));
  });

  // Stats
  app.get('/api/v1/whatsapp/stats', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const stats = await db('whatsapp_messages').where('tenant_id', tenantId)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent"),
        db.raw("COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered"),
        db.raw("COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed"),
        db.raw("COUNT(CASE WHEN status = 'read' THEN 1 END) as read_count"),
      ).first();
    return sendSuccess(reply, stats);
  });

  // Templates
  app.get('/api/v1/whatsapp/templates', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const templates = await db('whatsapp_templates').where('tenant_id', tenantId).orderBy('name');
    return sendSuccess(reply, templates);
  });

  // Send message (simulated - stores in DB)
  app.post('/api/v1/whatsapp/send', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { to, message, templateId, patientId } = request.body as { to: string; message: string; templateId?: string; patientId?: string };
    const [msg] = await db('whatsapp_messages').insert({
      tenant_id: tenantId, sender_id: ctx.userId, patient_id: patientId || null,
      to_number: to, message, template_id: templateId || null,
      status: 'sent', direction: 'outbound',
    }).returning('*');
    return sendSuccess(reply, { id: msg.id, status: 'sent' }, 'Message sent', 201);
  });
}
