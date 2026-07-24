import crypto from "crypto";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { logAudit } from '../../services/audit.js';

let queueWsClients = new Set<{ send(data: string): void; on(event: string, handler: (...args: unknown[]) => void): void }>();

function broadcastQueueUpdate(data: Record<string, unknown>): void {
  const msg = JSON.stringify(data);
  for (const client of queueWsClients) {
    try { (client as { send(data: string): void }).send(msg); } catch { queueWsClients.delete(client); }
  }
}

export async function registerPatientExperienceModule(app: FastifyInstance) {

  // ==================== KIOSK CHECK-IN ====================

  app.post('/api/v1/kiosk/checkin', async (request, reply) => {
    const body = z.object({
      tenantSlug: z.string(), nationalId: z.string().min(4), appointmentId: z.string().uuid().optional(),
    }).parse(request.body);
    const tenant = await db('tenants').where({ slug: body.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Tenant not found', 404);

    const patient = await db('patients')
      .where({ tenant_id: tenant.id, national_id: body.nationalId })
      .orWhere({ tenant_id: tenant.id, medical_record_number: body.nationalId }).first();
    if (!patient) return sendError(reply, 'Patient not found', 404);

    const todayCount = await db('kiosk_checkins').where({ tenant_id: tenant.id }).whereRaw("DATE(created_at) = CURRENT_DATE").count('id as count').first();
    const queueNumber = Number(todayCount?.count || 0) + 1;
    const [checkin] = await db('kiosk_checkins').insert({
      tenant_id: tenant.id, patient_id: patient.id, appointment_id: body.appointmentId || null,
      queue_number: queueNumber, national_id_input: body.nationalId,
    }).returning('*');

    try { broadcastQueueUpdate({ type: 'checkin', queueNumber }); } catch {}

    return sendSuccess(reply, {
      checkinId: checkin.id, queueNumber, patientName: `${patient.first_name} ${patient.last_name}`,
      status: 'checked_in', estimatedWaitMinutes: crypto.randomInt(5, 20),
    }, 'Check-in successful', 201);
  });

  app.get('/api/v1/kiosk/status/:checkinId', async (request, reply) => {
    const { checkinId } = z.object({ checkinId: z.string().uuid() }).parse(request.params);
    const checkin = await db('kiosk_checkins').join('patients', 'kiosk_checkins.patient_id', 'patients.id')
      .where('kiosk_checkins.id', checkinId).select('kiosk_checkins.*', 'patients.first_name', 'patients.last_name').first();
    if (!checkin) return sendError(reply, 'Check-in not found', 404);
    const ahead = await db('kiosk_checkins').where({ tenant_id: checkin.tenant_id, status: 'checked_in' })
      .where('created_at', '<', checkin.created_at).count('id as count').first();
    return sendSuccess(reply, { ...checkin, patientsAhead: Number(ahead?.count || 0) });
  });

  app.get('/api/v1/kiosk/checkins', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({ status: z.string().optional(), date: z.string().optional() }).parse(request.query);
    const today = query.date || new Date().toISOString().split('T')[0];
    let qb = db('kiosk_checkins').join('patients', 'kiosk_checkins.patient_id', 'patients.id')
      .where('kiosk_checkins.tenant_id', tenantId).whereRaw("DATE(kiosk_checkins.created_at) = ?", [today]);
    if (query.status) qb = qb.andWhere('kiosk_checkins.status', query.status);
    const data = await qb.select('kiosk_checkins.*', 'patients.first_name', 'patients.last_name')
      .orderBy('kiosk_checkins.queue_number', 'asc');
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'kiosk.list', entityType: 'kiosk_checkin' }); } catch {}
    return sendSuccess(reply, data);
  });

  app.put('/api/v1/kiosk/checkins/:id/status', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ status: z.enum(['checked_in', 'waiting', 'in_progress', 'completed', 'no_show', 'called']) }).parse(request.body);
    const updates: Record<string, unknown> = { status: body.status };
    if (body.status === 'in_progress' || body.status === 'called') updates.called_at = db.fn.now();
    if (body.status === 'completed') updates.completed_at = db.fn.now();
    const { tenantId } = getCtx(request);
    await db('kiosk_checkins').where({ id, tenant_id: tenantId }).update(updates);
    try { broadcastQueueUpdate({ type: 'status_change', checkinId: id, newStatus: body.status }); } catch {}
    const { userId: statusUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: statusUserId, action: 'kiosk.status_update', entityType: 'kiosk_checkin', entityId: id, metadata: { status: body.status } }); } catch {}
    return sendSuccess(reply, { id, status: body.status }, 'Status updated');
  });

  // ==================== QUEUE DISPLAY ====================

  app.get('/api/v1/queue/display/:branchId?', async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const query = z.object({ tenantSlug: z.string() }).parse(request.query);
    const tenant = await db('tenants').where({ slug: query.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Tenant not found', 404);

    const settings = await db('queue_display_settings').where({ tenant_id: tenant.id })
      .andWhere(function () { if (branchId) this.where({ branch_id: branchId }); else this.whereNull('branch_id'); }).first();
    const queue = await db('kiosk_checkins').join('patients', 'kiosk_checkins.patient_id', 'patients.id')
      .where('kiosk_checkins.tenant_id', tenant.id).whereIn('kiosk_checkins.status', ['checked_in', 'waiting'])
      .select('kiosk_checkins.*', 'patients.first_name', 'patients.last_name').orderBy('kiosk_checkins.queue_number', 'asc').limit(50);
    const nowServing = await db('kiosk_checkins').join('patients', 'kiosk_checkins.patient_id', 'patients.id')
      .where('kiosk_checkins.tenant_id', tenant.id).where('kiosk_checkins.status', 'in_progress')
      .select('kiosk_checkins.*', 'patients.first_name', 'patients.last_name').first();
    return sendSuccess(reply, { settings: settings || {}, nowServing, queue, totalWaiting: queue.length, updatedAt: new Date().toISOString() });
  });

  // ==================== SURVEYS ====================

  app.get('/api/v1/surveys/active', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    return sendSuccess(reply, await db('surveys').where({ tenant_id: tenantId, is_active: true }).orderBy('name'));
  });

  app.post('/api/v1/surveys', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const body = z.object({
      name: z.string().min(1), type: z.string().optional().default('satisfaction'),
      questions: z.array(z.object({ id: z.string(), text: z.string(), type: z.enum(['rating', 'text', 'choice']), options: z.array(z.string()).optional(), required: z.boolean().optional().default(true) })).min(1),
      description: z.string().optional(), autoSend: z.boolean().optional().default(false),
    }).parse(request.body);
    const [survey] = await db('surveys').insert({
      tenant_id: tenantId, name: body.name, type: body.type, description: body.description || null,
      questions: JSON.stringify(body.questions), auto_send: body.autoSend,
    }).returning('*');
    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'survey.create', entityType: 'survey', entityId: survey.id }); } catch {}
    return sendSuccess(reply, survey, 'Survey created', 201);
  });

  app.post('/api/v1/surveys/:surveyId/respond', async (request, reply) => {
    const { surveyId } = z.object({ surveyId: z.string().uuid() }).parse(request.params);
    const body = z.object({
      tenantSlug: z.string(), responses: z.record(z.unknown()),
      patientId: z.string().uuid().optional(), patientComment: z.string().optional(),
    }).parse(request.body);
    const tenant = await db('tenants').where({ slug: body.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Tenant not found', 404);
    const survey = await db('surveys').where({ id: surveyId, tenant_id: tenant.id }).first();
    if (!survey) return sendError(reply, 'Survey not found', 404);

    let totalScore = 0; let count = 0;
    const questions = typeof survey.questions === 'string' ? JSON.parse(survey.questions) : survey.questions;
    for (const q of questions) { if (q.type === 'rating' && body.responses[q.id]) { totalScore += Number(body.responses[q.id]); count++; } }
    const [resp] = await db('survey_responses').insert({
      tenant_id: tenant.id, survey_id: surveyId, patient_id: body.patientId || null,
      responses: JSON.stringify(body.responses),
      overall_score: count > 0 ? Number((totalScore / count).toFixed(1)) : null,
      patient_comment: body.patientComment || null,
    }).returning('*');
    return sendSuccess(reply, { id: resp.id, score: resp.overall_score }, 'Survey submitted', 201);
  });

  app.get('/api/v1/surveys/responses', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({ page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20), surveyId: z.string().optional() }).parse(request.query);
    let qb = db('survey_responses').join('surveys', 'survey_responses.survey_id', 'surveys.id').leftJoin('patients', 'survey_responses.patient_id', 'patients.id').where('survey_responses.tenant_id', tenantId);
    if (query.surveyId) qb = qb.andWhere('survey_responses.survey_id', query.surveyId);
    const total = await qb.clone().count('survey_responses.id as count').first();
    const data = await qb.clone().select('survey_responses.*', 'surveys.name as survey_name', 'surveys.type as survey_type', 'patients.first_name', 'patients.last_name')
      .orderBy('survey_responses.created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);
    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'survey.responses_list', entityType: 'survey_response' }); } catch {}
    return sendPaginated(reply, data, Number(total?.count || 0), query.page, query.limit);
  });

  app.get('/api/v1/surveys/stats', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const totalResponses = await db('survey_responses').where({ tenant_id: tenantId }).count('id as count').first();
    const avgScore = await db('survey_responses').where({ tenant_id: tenantId }).avg('overall_score as avg').first();
    const bySurvey = await db('survey_responses').join('surveys', 'survey_responses.survey_id', 'surveys.id').where('survey_responses.tenant_id', tenantId)
      .select('surveys.name', 'surveys.type').count('survey_responses.id as count').avg('survey_responses.overall_score as avg_score').groupBy('surveys.name', 'surveys.type');
    const todayCount = await db('survey_responses').where({ tenant_id: tenantId }).whereRaw("DATE(created_at) = CURRENT_DATE").count('id as count').first();
    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'survey.stats', entityType: 'survey' }); } catch {}
    return sendSuccess(reply, { totalResponses: Number(totalResponses?.count || 0), averageScore: Number((avgScore as Record<string, unknown>)?.avg || 0).toFixed(1), bySurvey, todayCount: Number(todayCount?.count || 0) });
  });

  // ==================== QUEUE WEBSOCKET ====================

  if ((app as unknown as Record<string, unknown>).websocket) {
    ((app as unknown as Record<string, unknown>)['websocket'] as (...args: unknown[]) => void)('/api/v1/queue/ws', { options: { maxPayload: 65536 } }, async (socket: { send(data: string): void; on(event: string, handler: (...args: unknown[]) => void): void }, req: { url: string }) => {
      queueWsClients.add(socket);
      const url = new URL(req.url, 'http://localhost');
      const slug = url.searchParams.get('tenant');
      if (slug) {
        try {
          const tenant = await db('tenants').where({ slug }).first();
          if (tenant) {
            const queue = await db('kiosk_checkins').join('patients', 'kiosk_checkins.patient_id', 'patients.id').where('kiosk_checkins.tenant_id', tenant.id).whereIn('kiosk_checkins.status', ['checked_in', 'waiting']).select('kiosk_checkins.*', 'patients.first_name', 'patients.last_name').orderBy('kiosk_checkins.queue_number', 'asc').limit(50);
            socket.send(JSON.stringify({ type: 'initial', queue }));
          }
        } catch {}
      }
      socket.on('close', () => { queueWsClients.delete(socket); });
    });
  }

  // Module loaded
}

export { broadcastQueueUpdate };
