import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { PatientNotFoundError } from '@healthcare/shared/errors';

const EMERGENCY_WINDOW_MINUTES = 60;

export async function registerEmergencyAccessModule(app: FastifyInstance) {

  // ── Activate break-glass access for a patient ──
  app.post('/api/v1/emergency-access/activate', { preHandler: [authenticate, authorize('emergency_access.manage')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const body = z.object({
      patientId: z.string().uuid(),
      reason: z.string().min(10, 'A reason of at least 10 characters is required'),
    }).parse(request.body);

    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenantId }).whereNull('deleted_at').first();
    if (!patient) throw new PatientNotFoundError(body.patientId);

    const existing = await db('emergency_access')
      .where({ tenant_id: tenantId, user_id: actorId, patient_id: body.patientId, status: 'active' })
      .where('expires_at', '>', new Date())
      .first();
    if (existing) {
      return sendSuccess(reply, { id: existing.id, expiresAt: existing.expires_at }, 'Emergency access already active for this patient');
    }

    const expiresAt = new Date(Date.now() + EMERGENCY_WINDOW_MINUTES * 60 * 1000);
    const [record] = await db('emergency_access').insert({
      tenant_id: tenantId,
      user_id: actorId,
      patient_id: body.patientId,
      reason: body.reason,
      status: 'active',
      expires_at: expiresAt,
    }).returning('*');

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'emergency_access.activated',
      entityType: 'patient',
      entityId: body.patientId,
      result: 'success',
      metadata: {
        emergency: true,
        emergencyAccessId: record.id,
        reason: body.reason,
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, {
      id: record.id,
      patientId: body.patientId,
      reason: body.reason,
      expiresAt,
      windowMinutes: EMERGENCY_WINDOW_MINUTES,
    }, 'Emergency access activated — audited and time-limited', 201);
  });

  // ── Revoke an active emergency access ──
  app.post('/api/v1/emergency-access/:id/revoke', { preHandler: [authenticate, authorize('emergency_access.manage')] }, async (request, reply) => {
    const { tenantId, userId: actorId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ reason: z.string().min(1).optional() }).parse(request.body);

    const record = await db('emergency_access').where({ id, tenant_id: tenantId }).first();
    if (!record) return sendError(reply, 'Emergency access record not found', 404);
    if (record.status !== 'active') return sendSuccess(reply, { id }, 'Emergency access already closed');

    await db('emergency_access').where({ id }).update({
      status: 'revoked',
      revoked_by: actorId,
      revoked_at: new Date(),
      revoke_reason: body.reason || null,
    });

    await logAudit({
      tenantId,
      userId: actorId,
      action: 'emergency_access.revoked',
      entityType: 'patient',
      entityId: record.patient_id,
      result: 'success',
      metadata: { emergency: true, emergencyAccessId: id, reason: body.reason || null },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id }, 'Emergency access revoked');
  });

  // ── List my active emergency access ──
  app.get('/api/v1/emergency-access/active', { preHandler: [authenticate, authorize('emergency_access.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const records = await db('emergency_access')
      .where({ tenant_id: tenantId, user_id: userId, status: 'active' })
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc');
    return sendSuccess(reply, records);
  });

  // ── Tenant emergency access log (audit trail) ──
  app.get('/api/v1/emergency-access/log', { preHandler: [authenticate, authorize('emergency_access.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
    }).parse(request.query);

    const total = await db('emergency_access').where({ tenant_id: tenantId }).count('id as count').first();
    const records = await db('emergency_access')
      .where({ tenant_id: tenantId })
      .orderBy('created_at', 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return sendSuccess(reply, {
      items: records,
      total: Number(total?.count || 0),
      page: query.page,
      limit: query.limit,
    });
  });

  // ── Active emergency access for a specific patient ──
  app.get('/api/v1/emergency-access/patient/:patientId', { preHandler: [authenticate, authorize('emergency_access.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const record = await db('emergency_access')
      .where({ tenant_id: tenantId, user_id: userId, patient_id: patientId, status: 'active' })
      .where('expires_at', '>', new Date())
      .first();
    return sendSuccess(reply, record || null);
  });
}

