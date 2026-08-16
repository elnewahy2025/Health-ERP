import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerVoiceModule(app: FastifyInstance) {

  // List calls
  app.get('/api/v1/voice/calls', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { page = 1, limit = 20, status } = request.query as { page?: number; limit?: number; status?: string };
    let q = db('voice_calls').where('voice_calls.tenant_id', tenantId);
    if (status) q = q.andWhere('voice_calls.status', status);
    const total = await q.clone().count('id as c').first();
    const calls = await q.leftJoin('patients', 'voice_calls.patient_id', 'patients.id')
      .select('voice_calls.*', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('voice_calls.created_at', 'desc').limit(Number(limit)).offset((Number(page) - 1) * Number(limit));
    const mapped = calls.map((c: Record<string, unknown>) => ({
      id: c.id, fromNumber: c.from_number, toNumber: c.to_number,
      patientName: c.pf ? `${c.pf} ${c.pl}` : null, patientId: c.patient_id,
      status: c.status, duration: c.duration, direction: c.direction,
      telLink: c.tel_link, startedAt: c.started_at, endedAt: c.ended_at, createdAt: c.created_at,
    }));
    return sendPaginated(reply, mapped, Number(total?.c || 0), Number(page), Number(limit));
  });

  // Stats
  app.get('/api/v1/voice/stats', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const stats = await db('voice_calls').where('tenant_id', tenantId)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw("COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed"),
        db.raw("COUNT(CASE WHEN status = 'missed' THEN 1 END) as missed"),
        db.raw('COALESCE(SUM(duration), 0) as total_duration'),
      ).first();
    return sendSuccess(reply, stats);
  });

  // Make a call — generates tel: link and stores record
  app.post('/api/v1/voice/call', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { toNumber, patientId, fromNumber } = request.body as { toNumber: string; patientId?: string; fromNumber?: string };

    const cleanNumber = toNumber.replace(/[^0-9+]/g, '');
    const telLink = `tel:${cleanNumber}`;

    const [call] = await db('voice_calls').insert({
      tenant_id: tenantId, sender_id: ctx.userId, patient_id: patientId || null,
      from_number: fromNumber || 'clinic', to_number: cleanNumber,
      status: 'completed', direction: 'outbound', duration: 0,
      tel_link: telLink, started_at: new Date(), ended_at: new Date(),
    }).returning('*');

    return sendSuccess(reply, { id: call.id, status: 'completed', telLink }, 'Call ready', 201);
  });

  // Conference call — generates multiple tel: links
  app.post('/api/v1/voice/conference', { preHandler: [authenticate, authorize('communications.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { toNumbers, patientId } = request.body as { toNumbers: string[]; patientId?: string };
    const calls = [];
    for (const to of toNumbers) {
      const cleanNumber = to.replace(/[^0-9+]/g, '');
      const telLink = `tel:${cleanNumber}`;
      const [call] = await db('voice_calls').insert({
        tenant_id: tenantId, sender_id: ctx.userId, patient_id: patientId || null,
        from_number: 'clinic', to_number: cleanNumber,
        status: 'completed', direction: 'outbound', duration: 0,
        tel_link: telLink, started_at: new Date(), ended_at: new Date(),
      }).returning('*');
      calls.push({ id: call.id, toNumber: cleanNumber, status: 'completed', telLink });
    }
    return sendSuccess(reply, { calls }, 'Calls ready', 201);
  });
}
