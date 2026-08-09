import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { PaginationQuery } from "../types.js";

export async function registerPatientMessagingModule(app: FastifyInstance) {
  // ── Staff: Send message to patient ──
  app.post('/api/v1/patient-messages/send', { preHandler: [authenticate, authorize('patient_messages.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [msg] = await db('patient_messages').insert({
      tenant_id: tenantId, patient_id: body.patientId,
      sender_id: ctx.userId, direction: 'outbound',
      subject: body.subject || 'Message from your healthcare provider',
      body: body.message,
    }).returning('*');
    return sendSuccess(reply, { id: msg.id }, 'Message sent', 201);
  });

  // ── Staff: List messages for a patient ──
  app.get('/api/v1/patient-messages/:patientId', { preHandler: [authenticate, authorize('patient_messages.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { patientId } = request.params as { patientId: string };
    const messages = await db('patient_messages').where({ tenant_id: tenantId, patient_id: patientId })
      .leftJoin('users', 'patient_messages.sender_id', 'users.id')
      .select('patient_messages.*', 'users.first_name as sender_first', 'users.last_name as sender_last')
      .orderBy('created_at', 'desc').limit(100);
    return sendSuccess(reply, messages.map((m: Record<string, unknown>) => ({
      id: m.id, subject: m.subject, body: m.body, direction: m.direction,
      senderName: m.sender_first ? m.sender_first + ' ' + m.sender_last : null,
      isRead: m.is_read, readAt: m.read_at, createdAt: m.created_at,
    })));
  });

  // ── Staff: Mark as read ──
  app.put('/api/v1/patient-messages/:id/read', { preHandler: [authenticate, authorize('patient_messages.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db('patient_messages').where({ id }).update({ is_read: true, read_at: new Date() });
    return sendSuccess(reply, null, 'Marked as read');
  });

  // ── Staff: List conversations (unique patients with unread) ──
  app.get('/api/v1/patient-messages/conversations/list', { preHandler: [authenticate, authorize('patient_messages.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const conversations = await db('patient_messages')
      .where('patient_messages.tenant_id', tenantId)
      .join('patients', 'patient_messages.patient_id', 'patients.id')
      .select('patient_messages.patient_id', 'patients.first_name', 'patients.last_name', 'patients.phone')
      .max('patient_messages.created_at as last_message_at')
      .count('patient_messages.id as total_messages')
      .sum(db.raw('CASE WHEN patient_messages.direction = \'outbound\' AND patient_messages.is_read = false THEN 1 ELSE 0 END as unread'))
      .groupBy('patient_messages.patient_id', 'patients.first_name', 'patients.last_name', 'patients.phone')
      .orderByRaw('max(patient_messages.created_at) desc')
      .limit(50);
    return sendSuccess(reply, conversations.map((c: Record<string, unknown>) => ({
      patientId: c.patient_id, patientName: String(c.first_name) + ' ' + String(c.last_name),
      patientPhone: c.phone, lastMessageAt: c.last_message_at,
      totalMessages: Number(c.total_messages), unread: Number(c.unread || 0),
    })));
  });

  // ── Appointment Reminders ──
  app.get('/api/v1/patient-messages/reminders', { preHandler: [authenticate, authorize('patient_messages.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status } = request.query as PaginationQuery & { status?: string };
    let q = db('appointment_reminders').where('appointment_reminders.tenant_id', tenantId);
    if (status) q = q.andWhere('status', status);
    const reminders = await q.leftJoin('appointments', 'appointment_reminders.appointment_id', 'appointments.id')
      .leftJoin('patients', 'appointments.patient_id', 'patients.id')
      .select('appointment_reminders.*', 'patients.first_name as pf', 'patients.last_name as pl', 'appointments.appointment_date')
      .orderBy('scheduled_at', 'desc').limit(50);
    return sendSuccess(reply, reminders.map((r: Record<string, unknown>) => ({
      id: r.id, appointmentId: r.appointment_id, patientName: String(r.pf) + ' ' + String(r.pl),
      appointmentDate: r.appointment_date, channel: r.channel,
      status: r.status, scheduledAt: r.scheduled_at, sentAt: r.sent_at
    })));
  });

  app.post('/api/v1/patient-messages/reminders', { preHandler: [authenticate, authorize('patient_messages.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [rem] = await db('appointment_reminders').insert({
      tenant_id: tenantId, appointment_id: body.appointmentId,
      channel: body.channel || 'sms', scheduled_at: body.scheduledAt || new Date(),
    }).returning('*');
    return sendSuccess(reply, { id: rem.id }, 'Reminder scheduled', 201);
  });
}
