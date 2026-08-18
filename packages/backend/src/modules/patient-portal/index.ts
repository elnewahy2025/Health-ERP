import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { getCtx } from '../../utils/route-helper.js';
import { logAudit } from '../../services/audit.js';
import { loadClinicNotificationContext } from '../../services/notification.js';
import { createRateLimiter } from '../../utils/rate-limiter.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { encryptField, decryptField, generateMedicalRecordNumber } from '@healthcare/shared/utils';
import { findByNationalId, insertPatient } from '../patient/patient.repository.js';
import { normalizePortalPhone, isValidPortalPhone, isValidNationalId, waMeLink } from './helpers.js';
import type { AppointmentRow, EmrRecordRow, InvoiceRow, PatientSharedDocumentRow } from '../types.js';

const portalRequestRateLimit = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
const portalOtpRateLimit = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

async function getPatientTenantId(patientId: string): Promise<string | null> {
  const patient = await db('patients').where({ id: patientId }).whereNull('deleted_at').select('tenant_id').first();
  return patient?.tenant_id ?? null;
}

export async function registerPatientPortalModule(app: FastifyInstance) {

  // ══ PUBLIC — Patient access request (staff-verified enrollment) ══
  app.post('/api/v1/portal/request-access', { preHandler: portalRequestRateLimit }, async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const { tenantSlug, firstName, lastName, countryCode, phone, nationalId, dateOfBirth, gender, email } = body;

    if (!tenantSlug || !firstName || !lastName || !countryCode || !phone || !nationalId || !dateOfBirth || !gender) {
      return reply.status(400).send({ success: false, error: 'All fields except email are required' });
    }
    if (!isValidNationalId(String(nationalId))) {
      return reply.status(400).send({ success: false, error: 'National ID must be exactly 14 digits' });
    }
    if (!isValidPortalPhone(String(countryCode), String(phone))) {
      return reply.status(400).send({ success: false, error: 'Enter a valid phone number with its country code' });
    }
    const dob = new Date(String(dateOfBirth));
    if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) {
      return reply.status(400).send({ success: false, error: 'Enter a valid date of birth' });
    }

    const tenant = await db('tenants').where({ slug: String(tenantSlug), status: 'active' }).first();
    if (!tenant) return reply.status(404).send({ success: false, error: 'Organization not found' });

    const fullPhone = normalizePortalPhone(String(countryCode), String(phone));
    const existing = await db('portal_enrollment_requests')
      .where({ tenant_id: tenant.id, phone: fullPhone })
      .whereIn('status', ['pending', 'approved'])
      .first();
    if (existing) {
      return sendSuccess(reply, {
        message: 'An access request is already under review. A staff member will send your OTP via WhatsApp.',
        requestId: existing.id,
        status: existing.status,
      });
    }

    const [enrollment] = await db('portal_enrollment_requests').insert({
      tenant_id: tenant.id,
      first_name: String(firstName).trim(),
      last_name: String(lastName).trim(),
      country_code: String(countryCode).trim(),
      phone: fullPhone,
      national_id: encryptField(String(nationalId).trim()),
      date_of_birth: dob.toISOString().split('T')[0],
      gender: String(gender).toLowerCase(),
      email: email ? String(email).trim() : null,
      status: 'pending',
    }).returning('*');

    await logAudit({
      tenantId: tenant.id,
      action: 'portal.enrollment_requested',
      entityType: 'portal_enrollment_request',
      entityId: enrollment.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, {
      message: 'Your access request was submitted. A staff member will review it and send your OTP via WhatsApp.',
      requestId: enrollment.id,
    });
  });

  // ══ PUBLIC — Request OTP (approved enrollment required) ══
  app.post('/api/v1/portal/otp/request', { preHandler: portalOtpRateLimit }, async (request, reply) => {
    const { tenantSlug, countryCode, phone } = request.body as Record<string, unknown>;
    if (!tenantSlug || !countryCode || !phone) {
      return reply.status(400).send({ success: false, error: 'Organization code, country code and phone are required' });
    }
    if (!isValidPortalPhone(String(countryCode), String(phone))) {
      return reply.status(400).send({ success: false, error: 'Enter a valid phone number with its country code' });
    }

    const tenant = await db('tenants').where({ slug: String(tenantSlug), status: 'active' }).first();
    if (!tenant) return reply.status(404).send({ success: false, error: 'Organization not found' });

    const fullPhone = normalizePortalPhone(String(countryCode), String(phone));
    const enrollment = await db('portal_enrollment_requests')
      .where({ tenant_id: tenant.id, phone: fullPhone, status: 'approved' })
      .first();
    if (!enrollment || !enrollment.patient_id) {
      return reply.status(404).send({
        success: false,
        error: 'No approved portal access for this phone. Submit an access request first and wait for staff approval.',
      });
    }

    const active = await db('portal_sessions')
      .where({ patient_id: enrollment.patient_id, tenant_id: tenant.id })
      .whereIn('delivery_status', ['pending', 'sent'])
      .where('otp_expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();
    if (active) {
      return sendSuccess(reply, {
        token: active.token,
        expiresIn: 600,
        message: 'An OTP was already requested. The hospital will send it via WhatsApp.',
      });
    }

    const otp = crypto.randomInt(100000, 1000000).toString();
    const token = crypto.randomBytes(48).toString('hex');
    const now = new Date();
    await db('portal_sessions').insert({
      patient_id: enrollment.patient_id,
      tenant_id: tenant.id,
      token,
      otp_encrypted: encryptField(otp),
      otp_expires_at: new Date(now.getTime() + 10 * 60 * 1000),
      delivery_status: 'pending',
      otp_requested_at: now,
      expires_at: new Date(now.getTime() + 10 * 60 * 1000),
      ip_address: request.ip,
      user_agent: request.headers['user-agent'] || null,
    });

    await logAudit({
      tenantId: tenant.id,
      action: 'portal.otp_requested',
      entityType: 'portal_enrollment_request',
      entityId: enrollment.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, {
      token,
      expiresIn: 600,
      message: 'OTP requested. The hospital will send it to you via WhatsApp.',
    });
  });

  // ══ PUBLIC — Verify OTP → portal session ══
  app.post('/api/v1/portal/verify', async (request, reply) => {
    const { token, otp } = request.body as Record<string, unknown>;
    if (!token || !otp) return reply.status(400).send({ success: false, error: 'Token and OTP are required' });

    const session = await db('portal_sessions')
      .where({ token: String(token) })
      .whereIn('delivery_status', ['pending', 'sent'])
      .where('otp_expires_at', '>', new Date())
      .where('expires_at', '>', new Date())
      .first();
    if (!session) return reply.status(401).send({ success: false, error: 'Invalid or expired OTP' });

    let valid = false;
    if (session.otp_encrypted) {
      try { valid = decryptField(String(session.otp_encrypted)) === String(otp); } catch { valid = false; }
    } else {
      valid = session.otp === String(otp);
    }
    if (!valid) {
      await logAudit({
        tenantId: session.tenant_id,
        action: 'portal.otp_failed',
        entityType: 'patient',
        entityId: session.patient_id,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
      });
      return reply.status(401).send({ success: false, error: 'Invalid or expired OTP' });
    }

    const patient = await db('patients').where({ id: session.patient_id }).whereNull('deleted_at').first();
    if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found' });

    const accessToken = crypto.randomBytes(64).toString('hex');
    await db('portal_sessions').where({ id: session.id }).update({
      token: accessToken,
      otp_encrypted: null,
      otp: null,
      otp_expires_at: null,
      delivery_status: 'verified',
      last_activity_at: new Date(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await logAudit({
      tenantId: patient.tenant_id,
      action: 'portal.otp_verified',
      entityType: 'patient',
      entityId: patient.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, {
      accessToken,
      patient: {
        id: patient.id, firstName: patient.first_name, lastName: patient.last_name,
        email: patient.email, phone: patient.phone, dateOfBirth: patient.date_of_birth,
        gender: patient.gender, medicalRecordNumber: patient.medical_record_number,
      },
      tenantId: patient.tenant_id,
    });
  });

  // ══ STAFF — Portal access requests queue ══
  app.get('/api/v1/portal/enrollments', { preHandler: [authenticate, authorize('patient_portal.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const { status } = z.object({ status: z.string().optional() }).parse(request.query);
    const query = db('portal_enrollment_requests').where({ tenant_id: tenantId });
    if (status) query.andWhere('status', status);
    const rows = await query.orderBy('created_at', 'desc').limit(200);
    return sendSuccess(reply, rows.map((r: Record<string, unknown>) => {
      let nationalId: string | null = null;
      if (r.national_id) {
        try { nationalId = decryptField(String(r.national_id)); } catch { nationalId = null; }
      }
      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        countryCode: r.country_code,
        phone: r.phone,
        nationalId,
        dateOfBirth: r.date_of_birth,
        gender: r.gender,
        email: r.email,
        status: r.status,
        patientId: r.patient_id,
        notes: r.notes,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
      };
    }));
  });

  app.post('/api/v1/portal/enrollments/:id/approve', { preHandler: [authenticate, authorize('patient_portal.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const enrollment = await db('portal_enrollment_requests').where({ id, tenant_id: tenantId }).first();
    if (!enrollment) return sendError(reply, 'Enrollment request not found', 404);
    if (enrollment.status !== 'pending') {
      return reply.status(409).send({ success: false, error: 'This request was already reviewed' });
    }

    let nationalId: string | null = null;
    if (enrollment.national_id) {
      try { nationalId = decryptField(String(enrollment.national_id)); } catch { nationalId = null; }
    }

    let patientId = enrollment.patient_id as string | null;
    if (!patientId) {
      const existing = nationalId ? await findByNationalId(nationalId, tenantId) : undefined;
      if (existing) patientId = existing.id;
    }
    if (!patientId) {
      const patient = await insertPatient({
        tenantId,
        medicalRecordNumber: generateMedicalRecordNumber(),
        firstName: enrollment.first_name,
        lastName: enrollment.last_name,
        dateOfBirth: String(enrollment.date_of_birth),
        gender: enrollment.gender,
        phone: enrollment.phone,
        email: enrollment.email || null,
        nationalId,
        nationality: null,
        bloodType: null,
        address: null,
        emergencyContact: null,
        locale: 'en',
        userId,
      });
      patientId = patient.id;
    }

    await db('portal_enrollment_requests').where({ id }).update({
      status: 'approved',
      patient_id: patientId,
      reviewed_by: userId,
      reviewed_at: new Date(),
    });

    await logAudit({
      tenantId,
      userId,
      action: 'portal.enrollment_approved',
      entityType: 'portal_enrollment_request',
      entityId: id,
      metadata: { patientId },
    });

    return sendSuccess(reply, { message: 'Access approved. The patient can now request an OTP.', patientId });
  });

  app.post('/api/v1/portal/enrollments/:id/reject', { preHandler: [authenticate, authorize('patient_portal.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { notes } = (request.body ?? {}) as Record<string, unknown>;
    const enrollment = await db('portal_enrollment_requests').where({ id, tenant_id: tenantId }).first();
    if (!enrollment) return sendError(reply, 'Enrollment request not found', 404);
    if (enrollment.status !== 'pending') {
      return reply.status(409).send({ success: false, error: 'This request was already reviewed' });
    }

    await db('portal_enrollment_requests').where({ id }).update({
      status: 'rejected',
      reviewed_by: userId,
      reviewed_at: new Date(),
      notes: notes ? String(notes) : enrollment.notes,
    });

    await logAudit({ tenantId, userId, action: 'portal.enrollment_rejected', entityType: 'portal_enrollment_request', entityId: id });
    return sendSuccess(reply, { message: 'Request rejected' });
  });

  // ══ STAFF — OTP delivery queue (patients waiting for the hospital to send OTP) ══
  app.get('/api/v1/portal/otp-queue', { preHandler: [authenticate, authorize('patient_portal.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const clinic = await loadClinicNotificationContext(tenantId);
    const rows = await db('portal_sessions as portal_sessions')
      .join('patients', 'portal_sessions.patient_id', 'patients.id')
      .where('portal_sessions.tenant_id', tenantId)
      .whereIn('portal_sessions.delivery_status', ['pending', 'sent'])
      .where('portal_sessions.otp_expires_at', '>', new Date())
      .orderBy('portal_sessions.created_at', 'asc')
      .select(
        'portal_sessions.id', 'portal_sessions.patient_id', 'portal_sessions.otp_encrypted',
        'portal_sessions.otp', 'portal_sessions.delivery_status', 'portal_sessions.otp_requested_at',
        'portal_sessions.otp_sent_at', 'portal_sessions.otp_expires_at', 'portal_sessions.created_at',
        'patients.first_name', 'patients.last_name', 'patients.phone as patient_phone',
      );

    return sendSuccess(reply, rows.map((r: Record<string, unknown>) => {
      let otp: string | null = null;
      if (r.otp_encrypted) {
        try { otp = decryptField(String(r.otp_encrypted)); } catch { otp = null; }
      } else {
        otp = r.otp ? String(r.otp) : null;
      }
      const phone = String(r.patient_phone || '');
      const message = `Your ${clinic.displayName || 'Clinic'} OTP is ${otp || '______'}. It expires in 10 minutes.`;
      return {
        id: r.id,
        patientId: r.patient_id,
        firstName: r.first_name,
        lastName: r.last_name,
        phone,
        otp,
        waMeLink: phone ? waMeLink(phone, message) : null,
        status: r.delivery_status,
        requestedAt: r.otp_requested_at || r.created_at,
        sentAt: r.otp_sent_at,
        expiresAt: r.otp_expires_at,
      };
    }));
  });

  app.post('/api/v1/portal/otp-queue/:id/sent', { preHandler: [authenticate, authorize('patient_portal.manage')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const session = await db('portal_sessions').where({ id, tenant_id: tenantId }).first();
    if (!session) return sendError(reply, 'OTP request not found', 404);

    await db('portal_sessions').where({ id }).update({ delivery_status: 'sent', otp_sent_at: new Date() });
    await logAudit({ tenantId, userId, action: 'portal.otp_sent', entityType: 'portal_session', entityId: id });
    return sendSuccess(reply, { message: 'Marked as sent' });
  });

  // ══ Portal Auth Middleware ══
  async function portalAuth(request: FastifyRequest, reply: FastifyReply) {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send({ success: false, error: 'Unauthorized' });
    const token = auth.slice(7);
    const session = await db('portal_sessions')
      .where({ token, delivery_status: 'verified' })
      .where('expires_at', '>', new Date())
      .first();
    if (!session) return reply.status(401).send({ success: false, error: 'Session expired' });
    await db('portal_sessions').where({ id: session.id }).update({ last_activity_at: new Date() });
    (request as unknown as Record<string, unknown>).patientId = session.patient_id;
    (request as unknown as Record<string, unknown>).portalSession = session;
  }

  // ══ Patient Dashboard ══
  app.get('/api/v1/portal/dashboard', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const patient = await db('patients').where({ id: patientId }).whereNull('deleted_at').first();

    const upcomingAppts = await db('appointments')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereIn('status', ['scheduled', 'confirmed'])
      .where('appointment_date', '>=', new Date().toISOString().split('T')[0])
      .orderBy('appointment_date').limit(5);

    const recentRecords = await db('emr_records')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .orderBy('created_at', 'desc').limit(5);

    const recentInvoices = await db('invoices')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereIn('status', ['pending', 'partial'])
      .orderBy('created_at', 'desc').limit(5);

    const unreadMessages = await db('patient_messages')
      .where({ patient_id: patientId, tenant_id: tenantId, direction: 'outbound', is_read: false })
      .count('id as c').first();

    return sendSuccess(reply, {
      patient: patient ? {
        id: patient.id, firstName: patient.first_name,
        lastName: patient.last_name, medicalRecordNumber: patient.medical_record_number,
      } : null,
      upcomingAppointments: upcomingAppts.map((a: AppointmentRow) => ({
        id: a.id, date: a.appointment_date, time: a.start_time,
        type: a.type, status: a.status,
        doctorId: a.doctor_id, branchId: a.branch_id,
      })),
      recentRecords: recentRecords.map((r: EmrRecordRow) => ({
        id: r.id, diagnosis: Array.isArray(r.diagnosis)
          ? r.diagnosis.slice(0, 100).join(', ')
          : String(r.diagnosis || '').substring(0, 100),
        createdAt: r.created_at,
      })),
      pendingBills: recentInvoices.map((i: InvoiceRow) => ({
        id: i.id, invoiceNumber: i.invoice_number,
        total: Number(i.total), dueAmount: Number(i.total) - Number(i.paid),
        dueDate: i.due_date,
      })),
      unreadMessages: Number((unreadMessages as Record<string, unknown>)?.c || 0),
    });
  });

  // ══ My Appointments ══
  app.get('/api/v1/portal/appointments', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const { status } = request.query as Record<string, unknown>;
    let q = db('appointments').where({ patient_id: patientId, tenant_id: tenantId });
    if (typeof status === 'string' && status) q = q.andWhere('status', status);
    const appointments = await q.orderBy('appointment_date', 'desc').limit(50);
    return sendSuccess(reply, appointments.map((a: AppointmentRow) => ({
      id: a.id, date: a.appointment_date, time: a.start_time, endTime: a.end_time,
      type: a.type, status: a.status, reason: a.reason,
      doctorId: a.doctor_id, branchId: a.branch_id, notes: a.notes,
    })));
  });

  // ══ My Medical Records ══
  app.get('/api/v1/portal/records', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const records = await db('emr_records')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, records.map((r: EmrRecordRow) => ({
      id: r.id, diagnosis: r.diagnosis, symptoms: r.subjective,
      treatment: r.plan, notes: r.notes, doctorId: r.doctor_id,
      encounterDate: r.encounter_date, createdAt: r.created_at,
    })));
  });

  // ══ My Bills ══
  app.get('/api/v1/portal/bills', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const invoices = await db('invoices')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, invoices.map((i: InvoiceRow) => ({
      id: i.id, invoiceNumber: i.invoice_number, items: i.items,
      subtotal: Number(i.subtotal), discount: Number(i.discount),
      tax: Number(i.tax), total: Number(i.total),
      paid: Number(i.paid), dueAmount: Number(i.total) - Number(i.paid),
      status: i.status, dueDate: i.due_date, issuedAt: i.issued_at,
    })));
  });

  // ══ Shared Documents ══
  app.get('/api/v1/portal/documents', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const docs = await db('patient_shared_documents')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .orderBy('shared_at', 'desc').limit(50);
    return sendSuccess(reply, docs.map((d: PatientSharedDocumentRow) => ({
      id: d.id, title: d.title, fileName: d.file_name,
      fileType: d.file_type, category: d.category,
      notes: d.notes, sharedAt: d.shared_at,
      isAcknowledged: d.is_acknowledged,
    })));
  });

  // ══ My Messages ══
  app.get('/api/v1/portal/messages', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const messages = await db('patient_messages')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, messages.map((m: Record<string, unknown>) => ({
      id: m.id, subject: m.subject, body: m.body,
      direction: m.direction, isRead: m.is_read,
      createdAt: m.created_at,
    })));
  });

  app.post('/api/v1/portal/messages', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    if (!tenantId) return sendError(reply, 'Patient not found', 404);

    const body = request.body as Record<string, unknown>;
    const [msg] = await db('patient_messages').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      direction: 'inbound',
      subject: body.subject || 'General Inquiry',
      body: body.message,
    }).returning('*');

    await logAudit({
      tenantId,
      action: 'portal.message_sent',
      entityType: 'patient_message',
      entityId: msg.id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: msg.id }, 'Message sent', 201);
  });

  // ══ Portal Logout ══
  app.post('/api/v1/portal/logout', { preHandler: portalAuth }, async (request, reply) => {
    const patientId = (request as unknown as Record<string, unknown>).patientId as string;
    const tenantId = await getPatientTenantId(patientId);
    const session = (request as unknown as Record<string, unknown>).portalSession as { id: string };

    await db('portal_sessions').where({ id: session.id }).update({ expires_at: new Date() });

    if (tenantId) {
      await logAudit({
        tenantId,
        action: 'portal.logout',
        entityType: 'patient',
        entityId: patientId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
      });
    }

    return sendSuccess(reply, null, 'Logged out');
  });
}
