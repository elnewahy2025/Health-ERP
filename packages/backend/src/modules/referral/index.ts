import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerReferralModule(app: FastifyInstance) {
  app.get('/api/v1/referrals', { preHandler: [authenticate, authorize('referrals.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status, patientId } = request.query as { patientId?: string; status?: string };
    let q = db('referrals').where('referrals.tenant_id', tenantId).whereNull('referrals.deleted_at');
    if (status) q = q.andWhere('referrals.status', status);
    if (patientId) q = q.andWhere('referrals.patient_id', patientId);
    const rows = await q.join('patients', 'referrals.patient_id', 'patients.id')
      .leftJoin('users as doc', 'referrals.receiving_doctor_id', 'doc.id')
      .select('referrals.*', 'patients.first_name as p_first', 'patients.last_name as p_last', 'doc.first_name as doc_first', 'doc.last_name as doc_last')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, rows.map(mapRef));
  });

  app.post('/api/v1/referrals', { preHandler: [authenticate, authorize('referrals.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const refNum = "REF-" + Date.now().toString(36).toUpperCase();
    const [ref] = await db('referrals').insert({
      tenant_id: tenantId, patient_id: body.patientId, referring_doctor_id: ctx.userId,
      receiving_doctor_id: body.receivingDoctorId || null, referral_number: refNum,
      referral_type: body.referralType || 'specialist', priority: body.priority || 'normal',
      reason: body.reason, clinical_notes: body.clinicalNotes,
      external_facility: body.externalFacility, external_doctor: body.externalDoctor,
      referral_date: new Date().toISOString().split('T')[0], consent_obtained: body.consentObtained !== false,
      created_by: ctx.userId,
    }).returning('*');
    return sendSuccess(reply, { id: ref.id, referralNumber: ref.referral_number }, 'Referral created', 201);
  });

  app.put('/api/v1/referrals/:id/status', { preHandler: [authenticate, authorize('referrals.edit')] }, async (request, reply) => {
    const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    await db('referrals').where({ id }).update({ status: body.status, feedback: body.feedback || null, updated_at: new Date() });
    return sendSuccess(reply, null, 'Referral updated');
  });
}
function mapRef(r: Record<string, unknown>) { return {
  id: r.id, referralNumber: r.referral_number, patientId: r.patient_id,
  patientName: r.p_first + ' ' + r.p_last, referralType: r.referral_type,
  priority: r.priority, status: r.status, reason: r.reason,
  clinicalNotes: r.clinical_notes, feedback: r.feedback,
  referringDoctorId: r.referring_doctor_id, receivingDoctorId: r.receiving_doctor_id,
  receivingDoctorName: r.doc_first ? r.doc_first + ' ' + r.doc_last : null,
  externalFacility: r.external_facility, externalDoctor: r.external_doctor,
  referralDate: r.referral_date, appointmentDate: r.appointment_date,
  consentObtained: r.consent_obtained, createdAt: r.created_at,
};}
