import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

interface NotificationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string;
  status: string;
  reference_type: string | null;
  reference_id: string | null;
  sent_at: Date | null;
  read_at: Date | null;
  created_at: Date;
}

export async function registerNotificationModule(app: FastifyInstance) {
  app.get('/api/v1/notifications', { preHandler: [authenticate, authorize('notifications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const limit = parseInt(String((request.query as Record<string, unknown>)["limit"] || '20'));
    const notifs = await db('notifications').where({ tenant_id: tenantId, user_id: ctx.userId })
      .orderBy('created_at', 'desc').limit(limit);
    return sendSuccess(reply, notifs.map((n: NotificationRow) => ({
      id: n.id, channel: n.channel, recipient: n.recipient,
      subject: n.subject, body: n.body, status: n.status,
      referenceType: n.reference_type, referenceId: n.reference_id,
      sentAt: n.sent_at, readAt: n.read_at, createdAt: n.created_at,
    })));
  });

  app.put('/api/v1/notifications/:id/read', { preHandler: [authenticate, authorize('notifications.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    await db('notifications').where({ id, tenant_id: tenantId }).update({ status: 'read', read_at: new Date() });
    return sendSuccess(reply, null, 'Marked as read');
  });

  app.get('/api/v1/notifications/unread-count', { preHandler: [authenticate, authorize('notifications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const row = await db('notifications').where({ tenant_id: tenantId, user_id: ctx.userId, status: 'pending' }).count('id as count').first();
    const unreadCount = Number(row?.count || 0);
    return sendSuccess(reply, { unread: unreadCount });
  });
}
