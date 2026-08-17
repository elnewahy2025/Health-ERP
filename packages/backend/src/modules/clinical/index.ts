import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { logAudit } from '../../services/audit.js';
import { authenticate } from '../auth-guard.js';
import { authorize, canAccessPatient } from '../../services/authorization.js';

export async function registerClinicalModule(app: FastifyInstance) {

  app.get('/api/v1/icd10', async (request, reply) => {
    const q = z.object({ q: z.string().optional().default(''), page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20) }).parse(request.query);
    const qb = db('icd10_codes');
    if (q.q) { const s = `%${q.q}%`; qb.where(function() { this.where('code', 'ilike', s).orWhere('description', 'ilike', s).orWhere('full_description', 'ilike', s); }); }
    const total = await qb.clone().count('id as count').first();
    const codes = await qb.orderBy('code').limit(q.limit).offset((q.page - 1) * q.limit);
    return sendPaginated(reply, codes.map((c: Record<string, unknown>) => ({ id: c.id, code: c.code, description: c.description, fullDescription: c.full_description, isChronic: c.is_chronic })), Number((total as Record<string, unknown>)?.count || 0), q.page, q.limit);
  });

  app.get('/api/v1/medications/search', async (request, reply) => {
    const q = z.object({ q: z.string().optional().default(''), category: z.string().optional() }).parse(request.query);
    const qb = db('medication_database').where('status', 'active');
    if (q.q) { const s = `%${q.q}%`; qb.where(function() { this.where('generic_name', 'ilike', s).orWhere('brand_names', 'ilike', s).orWhere('category', 'ilike', s); }); }
    if (q.category) qb.andWhere('category', q.category);
    const meds = await qb.orderBy('generic_name').limit(30);
    return sendSuccess(reply, meds.map((m: Record<string, unknown>) => ({ id: m.id, genericName: m.generic_name, brandNames: m.brand_names, category: m.category, route: m.route, dosageForm: m.dosage_form, strength: m.strength, indications: m.indications, contraindications: m.contraindications, sideEffects: m.side_effects, interactions: m.interactions })));
  });

  app.get('/api/v1/medications/categories', async (request, reply) => {
    const cats = await db('medication_database').where('status', 'active').distinct('category').orderBy('category');
    return sendSuccess(reply, cats.map((c: Record<string, unknown>) => c.category));
  });

  app.get('/api/v1/patients/:patientId/allergies', { preHandler: [authenticate, authorize('emr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const patient = await findTenantRow('patients', patientId, tenantId);
    if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found' });
    const allergies = await db('patient_allergies').where({ patient_id: patientId }).orderBy('created_at', 'desc');
    return sendSuccess(reply, allergies.map((a: Record<string, unknown>) => ({ id: a.id, allergen: a.allergen, severity: a.severity, reaction: a.reaction, notes: a.notes, createdAt: a.created_at })));
  });

  app.post('/api/v1/patients/:patientId/allergies', { preHandler: [authenticate, authorize('emr.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const body = z.object({ allergen: z.string().min(1), severity: z.enum(['mild', 'moderate', 'severe', 'anaphylaxis']).optional().default('moderate'), reaction: z.string().optional(), notes: z.string().optional() }).parse(request.body);
    const patient = await findTenantRow('patients', patientId, tenantId);
    if (!patient || !(await canAccessPatient(ctx.principal, patient as { id: string; tenant_id: string; branch_id?: string | null; department_id?: string | null }))) return reply.status(404).send({ success: false, error: 'Patient not found or outside your scope' });
    const [allergy] = await db('patient_allergies').insert({ tenant_id: tenantId, patient_id: patientId, allergen: body.allergen, severity: body.severity, reaction: body.reaction, notes: body.notes, recorded_by: ctx.userId }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'clinical.allergy_created', entityType: 'patient_allergy', entityId: allergy.id, metadata: { patientId, allergen: body.allergen }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, { id: allergy.id, allergen: allergy.allergen, severity: allergy.severity }, 'Allergy recorded', 201);
  });

  app.delete('/api/v1/patients/:patientId/allergies/:id', { preHandler: [authenticate, authorize('emr.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id, patientId } = z.object({ id: z.string().uuid(), patientId: z.string().uuid() }).parse(request.params);
    const patient = await findTenantRow('patients', patientId, tenantId);
    if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found' });
    await db('patient_allergies').where({ id, tenant_id: tenantId }).delete();

    await logAudit({ tenantId, userId: ctx.userId, action: 'clinical.allergy_deleted', entityType: 'patient_allergy', entityId: id, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Allergy deleted');
  });

  app.get('/api/v1/patients/:patientId/allergy-check', { preHandler: [authenticate, authorize('emr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const patient = await findTenantRow('patients', patientId, tenantId);
    if (!patient) return reply.status(404).send({ success: false, error: 'Patient not found' });
    const { medication } = z.object({ medication: z.string().optional() }).parse(request.query);
    const allergies = await db('patient_allergies').where({ patient_id: patientId }).select('allergen', 'severity', 'reaction');
    if (!medication) return sendSuccess(reply, { allergies, alerts: [] });
    const alerts: unknown[] = [];
    for (const allergy of allergies) {
      const ml = medication.toLowerCase(); const al = allergy.allergen.toLowerCase();
      if (ml.includes(al) || al.includes(ml)) alerts.push({ allergen: allergy.allergen, severity: allergy.severity, reaction: allergy.reaction, message: `Patient has ${allergy.severity} allergy to "${allergy.allergen}"` });
    }
    const medDb = await db('medication_database').where('generic_name', 'ilike', `%${medication}%`).first();
    if (medDb?.interactions) for (const allergy of allergies) { if (medDb.interactions.toLowerCase().includes(allergy.allergen.toLowerCase())) alerts.push({ allergen: allergy.allergen, severity: 'warning', message: `"${medDb.generic_name}" may interact with ${allergy.allergen}` }); }
    return sendSuccess(reply, { allergies, alerts, hasConflict: alerts.length > 0 });
  });

  app.get('/api/v1/patients/:patientId/timeline', { preHandler: [authenticate, authorize('emr.view')] }, async (request, reply) => {
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const tenantId = getTenantId(request);
    const [emr, appts, invs, docs, allergies] = await Promise.all([
      db('emr_records').where({ patient_id: patientId, tenant_id: tenantId }).whereNull('deleted_at').select(db.raw("'emr' as type"), 'id', 'encounter_date as date', db.raw("encounter_type || ' visit' as title"), 'diagnosis', 'vitals'),
      db('appointments').where({ patient_id: patientId, tenant_id: tenantId }).select(db.raw("'appointment' as type"), 'id', 'appointment_date as date', 'type as title', 'status'),
      db('invoices').where({ patient_id: patientId, tenant_id: tenantId }).whereNull('deleted_at').select(db.raw("'invoice' as type"), 'id', 'issued_at as date', 'invoice_number as title', 'total', 'status'),
      db('documents').where({ patient_id: patientId, tenant_id: tenantId }).whereNull('deleted_at').select(db.raw("'document' as type"), 'id', 'created_at as date', 'title', 'category'),
      db('patient_allergies').where({ patient_id: patientId, tenant_id: tenantId }).select(db.raw("'allergy' as type"), 'id', 'created_at as date', 'allergen as title', 'severity'),
    ]);
    const timeline = [...emr, ...appts, ...invs, ...docs, ...allergies].map((e: Record<string, unknown>) => ({ ...e, date: e.date })).filter((e: Record<string, unknown>) => e.date).sort((a: Record<string, unknown>, b: Record<string, unknown>) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime());
    return sendSuccess(reply, timeline);
  });
}
