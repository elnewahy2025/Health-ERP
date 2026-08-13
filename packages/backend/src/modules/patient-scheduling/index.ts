import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';

// Patient self-scheduling (no staff auth, uses portal token)
export async function registerPatientSchedulingModule(app: FastifyInstance) {

  // Get available slots for a doctor on a date
  app.get('/api/v1/portal/schedule/available', async (request, reply) => {
    const query = z.object({ tenantSlug: z.string(), doctorId: z.string().optional(), date: z.string() }).parse(request.query);
    const tenant = await db('tenants').where({ slug: query.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Clinic not found', 404);

    let doctorQuery = db('users').where({ tenant_id: tenant.id, role: 'doctor', is_active: true });
    if (query.doctorId) doctorQuery = doctorQuery.where('id', query.doctorId);
    const doctors = await doctorQuery.select('id', 'first_name', 'last_name');

    const existingApts = await db('appointments').where('tenant_id', tenant.id).whereRaw("DATE(scheduled_date) = ?", [query.date])
      .where('status', '!=', 'cancelled').select('doctor_id', 'scheduled_date', 'end_time');

    const slots: unknown[] = [];
    const startMin = 9 * 60;
    const endMin = 15 * 60; // 6 working hours
    const slotInterval = 30;
    for (const doctor of doctors) {
      for (let cur = startMin; cur + slotInterval <= endMin; cur += slotInterval) {
        const h = Math.floor(cur / 60);
        const m = cur % 60;
        const nh = Math.floor((cur + slotInterval) / 60);
        const nm = (cur + slotInterval) % 60;
        const start = `${query.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
        const end = `${query.date}T${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:00`;
        const isBooked = existingApts.some((a: Record<string, unknown>) =>
          a.doctor_id === doctor.id &&
          new Date(a.scheduled_date as string).getHours() === h &&
          new Date(a.scheduled_date as string).getMinutes() === m);
        if (!isBooked) {
          slots.push({ doctorId: doctor.id, doctorName: `${doctor.first_name} ${doctor.last_name}`, start, end });
        }
      }
    }
    return sendSuccess(reply, { date: query.date, slots, totalAvailable: slots.length });
  });

  // Patient books an appointment
  app.post('/api/v1/portal/schedule/book', async (request, reply) => {
    const body = z.object({
      tenantSlug: z.string(), patientId: z.string().uuid(), doctorId: z.string().uuid(),
      scheduledDate: z.string(), reason: z.string().optional(), type: z.string().optional().default('consultation'),
    }).parse(request.body);
    const tenant = await db('tenants').where({ slug: body.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Clinic not found', 404);

    const doctor = await db('users').where({ id: body.doctorId, tenant_id: tenant.id, role: 'doctor' }).first();
    if (!doctor) return sendError(reply, 'Doctor not found', 404);

    // Check for conflict
    const conflict = await db('appointments').where({ doctor_id: body.doctorId, tenant_id: tenant.id })
      .whereRaw("DATE(scheduled_date) = ?", [body.scheduledDate.split('T')[0]])
      .where('status', '!=', 'cancelled').first();
    if (conflict) return sendError(reply, 'Slot already taken. Please choose another time.', 409);

    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenant.id }).first();
    if (!patient) return sendError(reply, 'Patient not found', 404);

    const [apt] = await db('appointments').insert({
      tenant_id: tenant.id, patient_id: body.patientId, doctor_id: body.doctorId,
      scheduled_date: body.scheduledDate, type: body.type, reason: body.reason || null,
      status: 'scheduled', created_by: body.patientId,
    }).returning('*');

    return sendSuccess(reply, { appointment: apt, message: 'Appointment booked successfully' }, 'Booked', 201);
  });

  // Get available doctors
  app.get('/api/v1/portal/schedule/doctors', async (request, reply) => {
    const query = z.object({ tenantSlug: z.string() }).parse(request.query);
    const tenant = await db('tenants').where({ slug: query.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Clinic not found', 404);
    const doctors = await db('users').where({ tenant_id: tenant.id, role: 'doctor', is_active: true })
      .select('id', 'first_name', 'last_name', 'specialization');
    return sendSuccess(reply, doctors);
  });

  // Patient cancels own appointment
  app.post('/api/v1/portal/schedule/cancel', async (request, reply) => {
    const body = z.object({ tenantSlug: z.string(), patientId: z.string().uuid(), appointmentId: z.string().uuid() }).parse(request.body);
    const tenant = await db('tenants').where({ slug: body.tenantSlug }).first();
    if (!tenant) return sendError(reply, 'Clinic not found', 404);
    const apt = await db('appointments').where({ id: body.appointmentId, patient_id: body.patientId, tenant_id: tenant.id }).first();
    if (!apt) return sendError(reply, 'Appointment not found', 404);
    if (apt.status === 'completed' || apt.status === 'cancelled') return sendError(reply, 'Cannot cancel this appointment', 400);
    await db('appointments').where({ id: body.appointmentId }).update({ status: 'cancelled' });
    return sendSuccess(reply, null, 'Appointment cancelled');
  });

}
