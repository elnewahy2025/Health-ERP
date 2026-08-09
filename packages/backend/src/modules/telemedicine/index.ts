import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import type { PaginationQuery, TelemedicineSessionRow } from "../types.js";
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerTelemedicineModule(app: FastifyInstance) {
  app.get('/api/v1/telemedicine/sessions', { preHandler: [authenticate, authorize('telemedicine.view')] }, async (request, reply) => {
    const ctx = getCtx(request); const tenantId = getTenantId(request);
    const { status } = request.query as PaginationQuery & { status?: string };
    let q = db('telemedicine_sessions').where('telemedicine_sessions.tenant_id', tenantId).whereNull('telemedicine_sessions.deleted_at');
    if (status) q = q.andWhere('telemedicine_sessions.status', status);
    const sessions = await q.join('patients', 'telemedicine_sessions.patient_id', 'patients.id')
      .leftJoin('users', 'telemedicine_sessions.doctor_id', 'users.id')
      .select('telemedicine_sessions.*', 'patients.first_name as p_first', 'patients.last_name as p_last',
        'users.first_name as d_first', 'users.last_name as d_last')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, sessions.map((s: Record<string, unknown>) => ({
      id: s.id, sessionId: s.session_id, roomName: s.room_name, status: s.status,
      provider: s.provider, meetingLink: s.meeting_link, patientId: s.patient_id,
      patientName: String(s.p_first) + ' ' + String(s.p_last), doctorId: s.doctor_id,
      doctorName: s.d_first ? String(s.d_first) + ' ' + String(s.d_last) : null,
      appointmentId: s.appointment_id, startedAt: s.started_at, endedAt: s.ended_at,
      durationSeconds: s.duration_seconds, recordingEnabled: s.recording_enabled,
      notes: s.notes, createdAt: s.created_at,
    })));
  });

  app.post('/api/v1/telemedicine/sessions', { preHandler: [authenticate, authorize('telemedicine.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const sid = crypto.randomUUID();
    const roomName = 'room-' + sid.slice(0, 8);
    const meetingLink = body.meetingLink || (process.env.APP_URL || 'http://localhost:5173') + '/telemedicine/' + roomName;
    const [session] = await db('telemedicine_sessions').insert({
      tenant_id: tenantId, patient_id: body.patientId, doctor_id: ctx.userId,
      appointment_id: body.appointmentId || null, session_id: sid, room_name: roomName,
      provider: body.provider || 'internal', meeting_link: meetingLink,
      recording_enabled: body.recordingEnabled || false, notes: body.notes || null,
      created_by: ctx.userId, status: 'scheduled',
    }).returning('*');
    return sendSuccess(reply, { id: session.id, sessionId: session.session_id, roomName: session.room_name, meetingLink: session.meeting_link }, 'Session created', 201);
  });

  app.put('/api/v1/telemedicine/sessions/:id/status', { preHandler: [authenticate, authorize('telemedicine.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { status: body.status, updated_at: new Date() };
    if (body.status === 'active') update.started_at = new Date();
    if (body.status === 'completed') { update.ended_at = new Date(); update.duration_seconds = body.durationSeconds || 0; }
    await db('telemedicine_sessions').where({ id }).update(update);
    return sendSuccess(reply, null, 'Session updated');
  });
}
