import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { BookingSlotRow, UserRow, PaginationQuery, BookingRequestRow } from "../types.js";

export async function registerOnlineBookingModule(app: FastifyInstance) {
  // ── Public: Get available slots (no auth) ──
  app.get('/api/v1/booking/slots', async (request, reply) => {
    const { doctorId, date, tenantSlug } = request.query as { date?: string; doctorId?: string; tenantSlug?: string };
    if (!tenantSlug) return reply.status(400).send({ success: false, error: 'Tenant slug required' });
    const tenant = await db('tenants').where({ slug: tenantSlug, status: 'active' }).first();
    if (!tenant) return reply.status(404).send({ success: false, error: 'Organization not found' });

    let q = db('booking_slots').where({ tenant_id: tenant.id, is_available: true });
    if (doctorId) q = q.andWhere('doctor_id', doctorId);
    if (date) q = q.andWhere('date', date);
    else q = q.andWhere('date', '>=', new Date().toISOString().split('T')[0]);

    const slots = await q.orderBy('date').orderBy('start_time').limit(100);
    return sendSuccess(reply, slots.map((s: Record<string, unknown>) => ({
      id: s.id, doctorId: s.doctor_id, branchId: s.branch_id,
      date: s.date, startTime: s.start_time, endTime: s.end_time,
      slotType: s.slot_type, available: Boolean(s.is_available),
    })));
  });

  // ── Public: Get doctors for booking (no auth) ──
  app.get('/api/v1/booking/doctors', async (request, reply) => {
    const { tenantSlug } = request.query as { tenantSlug?: string };
    if (!tenantSlug) return reply.status(400).send({ success: false, error: 'Tenant slug required' });
    const tenant = await db('tenants').where({ slug: tenantSlug, status: 'active' }).first();
    if (!tenant) return reply.status(404).send({ success: false, error: 'Organization not found' });

    const doctors = await db('users').join('roles', 'users.role_id', 'roles.id')
      .where('users.tenant_id', tenant.id).where('users.status', 'active')
      .where('roles.slug', 'doctor')
      .select('users.id', 'users.first_name', 'users.last_name', 'users.email');
    return sendSuccess(reply, doctors.map((d: Record<string, unknown>) => ({
      id: d.id, name: d.first_name + ' ' + d.last_name, email: d.email,
    })));
  });

  // ── Public: Submit booking request (no auth) ──
  app.post('/api/v1/booking/request', async (request, reply) => {
    const { slotId, patientName, patientPhone, patientEmail, reason, tenantSlug } = request.body as Record<string, unknown>;
    if (!slotId || !patientName || !patientPhone || !tenantSlug) {
      return reply.status(400).send({ success: false, error: 'Missing required fields' });
    }
    const tenant = await db('tenants').where({ slug: tenantSlug, status: 'active' }).first();
    if (!tenant) return reply.status(404).send({ success: false, error: 'Organization not found' });

    const slot = await db('booking_slots').where({ id: slotId, tenant_id: tenant.id, is_available: true }).first();
    if (!slot) return reply.status(404).send({ success: false, error: 'Slot not available' });

    // Try to match existing patient
    const patient = await db('patients').where({ tenant_id: tenant.id, phone: patientPhone }).whereNull('deleted_at').first();

    const [req] = await db('booking_requests').insert({
      tenant_id: tenant.id, slot_id: slotId,
      patient_id: patient?.id || null,
      patient_name: patientName, patient_phone: patientPhone,
      patient_email: patientEmail || null, reason: reason || null,
      source: 'widget', status: 'pending',
    }).returning('*');

    // Mark slot as unavailable
    await db('booking_slots').where({ id: slotId }).update({ is_available: false });

    return sendSuccess(reply, {
      id: req.id, message: 'Booking request submitted. We will confirm shortly.',
    }, 'Booking request submitted', 201);
  });

  // ── Authenticated: Manage booking slots ──
  app.get('/api/v1/booking/manage/slots', { preHandler: [authenticate, authorize('online_booking.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { date, doctorId } = request.query as { date?: string; doctorId?: string };
    let q = db('booking_slots').where('booking_slots.tenant_id', tenantId);
    if (date) q = q.andWhere('date', date);
    if (doctorId) q = q.andWhere('doctor_id', doctorId);
    const slots = await q.orderBy('date').orderBy('start_time');
    return sendSuccess(reply, slots);
  });

  app.post('/api/v1/booking/manage/slots', { preHandler: [authenticate, authorize('online_booking.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    // Bulk create slots for a date range
    const { doctorId, date, startTime, endTime, intervalMinutes, branchId } = body;
    const slots = [];
    const [startH, startM] = (startTime as string).split(':').map(Number);
    const [endH, endM] = (endTime as string).split(':').map(Number);
    let current = startH * 60 + startM;
    const end = endH * 60 + endM;
    const interval = Number(intervalMinutes) || 30;

    while (current + interval <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      const next = current + interval;
      const nh = Math.floor(next / 60);
      const nm = next % 60;
      slots.push({
        tenant_id: tenantId, doctor_id: doctorId, branch_id: branchId || null,
        date, start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        end_time: `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`,
      });
      current = next;
    }
    if (slots.length > 0) await db('booking_slots').insert(slots);
    return sendSuccess(reply, { slotsCreated: slots.length }, 'Slots created', 201);
  });

  // ── Authenticated: View booking requests ──
  app.get('/api/v1/booking/manage/requests', { preHandler: [authenticate, authorize('online_booking.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status } = request.query as PaginationQuery & { status?: string };
    let q = db('booking_requests').where('booking_requests.tenant_id', tenantId);
    if (status) q = q.andWhere('status', status);
    const requests = await q.leftJoin('booking_slots', 'booking_requests.slot_id', 'booking_slots.id')
      .leftJoin('users', 'booking_slots.doctor_id', 'users.id')
      .select('booking_requests.*', 'booking_slots.date as slot_date', 'booking_slots.start_time', 'booking_slots.end_time',
        'users.first_name as doc_first', 'users.last_name as doc_last')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, requests.map((r: Record<string, unknown>) => ({
      id: r.id, patientName: r.patient_name, patientPhone: r.patient_phone,
      patientEmail: r.patient_email, reason: r.reason, status: r.status,
      source: r.source, slotDate: r.slot_date, slotTime: r.start_time,
      doctorName: r.doc_first ? r.doc_first + ' ' + r.doc_last : null,
      createdAt: r.created_at
    })));
  });

  app.put('/api/v1/booking/manage/requests/:id', { preHandler: [authenticate, authorize('online_booking.manage')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.status === 'confirmed') {
      update.confirmed_by = ctx.userId;
      update.confirmed_at = new Date();
      // Create appointment from booking
      const req = await db('booking_requests').where({ id }).first();
      if (req) {
        const slot = await db('booking_slots').where({ id: req.slot_id }).first();
        if (slot) {
          const patient = await db('patients').where({ tenant_id: req.tenant_id, phone: req.patient_phone }).whereNull('deleted_at').first();
          if (patient) {
            await db('appointments').insert({
              tenant_id: req.tenant_id, patient_id: patient.id, doctor_id: slot.doctor_id,
              appointment_date: slot.date, start_time: slot.start_time, end_time: slot.end_time,
              appointment_type: slot.slot_type || 'consultation', status: 'confirmed',
              reason: req.reason || null, branch_id: slot.branch_id || null,
            }).returning('*');
          }
        }
      }
    }
    await db('booking_requests').where({ id }).update(update);
    return sendSuccess(reply, null, 'Booking ' + body.status);
  });
}
