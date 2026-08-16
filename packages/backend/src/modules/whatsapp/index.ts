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
    const messages = await q.leftJoin('patients', 'whatsapp_messages.patient_id', 'patients.id')
      .select('whatsapp_messages.*', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('whatsapp_messages.created_at', 'desc').limit(Number(limit)).offset((Number(page) - 1) * Number(limit));
    const mapped = messages.map((m: Record<string, unknown>) => ({
      id: m.id, toNumber: m.to_number, patientName: m.pf ? `${m.pf} ${m.pl}` : null,
      patientId: m.patient_id, message: m.message, status: m.status,
      direction: m.direction, waLink: m.wa_link, createdAt: m.created_at,
    }));
    return sendPaginated(reply, mapped, Number(total?.c || 0), Number(page), Number(limit));
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
      ).first();
    return sendSuccess(reply, stats);
  });

  // Templates
  app.get('/api/v1/whatsapp/templates', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const templates = await db('whatsapp_templates').where('tenant_id', tenantId).orderBy('name');
    return sendSuccess(reply, templates);
  });

  // Send message — generates wa.me link and stores record
  app.post('/api/v1/whatsapp/send', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { to, message, patientId } = request.body as { to: string; message: string; patientId?: string };

    // Build wa.me link — opens WhatsApp on user's device
    const cleanNumber = to.replace(/[^0-9]/g, '');
    const encodedMsg = encodeURIComponent(message);
    const waLink = `https://wa.me/${cleanNumber}?text=${encodedMsg}`;

    const [msg] = await db('whatsapp_messages').insert({
      tenant_id: tenantId, sender_id: ctx.userId, patient_id: patientId || null,
      to_number: cleanNumber, message, status: 'sent', direction: 'outbound',
      wa_link: waLink,
    }).returning('*');

    return sendSuccess(reply, { id: msg.id, status: 'sent', waLink }, 'Message ready', 201);
  });
}
