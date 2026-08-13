import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { FormSubmissionRow } from "../types.js";

export async function registerFormsModule(app: FastifyInstance) {
  // Form Definitions
  app.get('/api/v1/forms/definitions', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { category, isActive } = request.query as { category?: string; isActive?: string };
    let q = db('form_definitions').where('form_definitions.tenant_id', tenantId);
    if (category) q = q.andWhere('category', category);
    if (isActive !== undefined) q = q.andWhere('is_active', isActive === 'true');
    const forms = await q.orderBy('name');
    return sendSuccess(reply, forms.map((f: Record<string, unknown>) => ({
      id: f.id, name: f.name, slug: f.slug, category: f.category,
      schema: f.schema, uiSchema: f.ui_schema, isActive: f.is_active,
      description: f.description, version: f.version,
      createdAt: f.created_at, updatedAt: f.updated_at
    })));
  });

  app.post('/api/v1/forms/definitions', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const slug = body.slug || (body.name as string).toLowerCase().replace(/\s+/g, '_');
    const [def] = await db('form_definitions').insert({
      tenant_id: tenantId, name: body.name, slug, category: body.category || 'general',
      schema: JSON.stringify(body.schema || {}), ui_schema: JSON.stringify(body.uiSchema || {}),
      is_active: body.isActive !== false, description: body.description || null,
      created_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: def.id, name: def.name, slug: def.slug }, 'Form definition created', 201);
  });

  app.put('/api/v1/forms/definitions/:id', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('form_definitions', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Form definition not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name;
    if (body.category) update.category = body.category;
    if (body.schema) update.schema = JSON.stringify(body.schema);
    if (body.uiSchema) update.ui_schema = JSON.stringify(body.uiSchema);
    if (body.description !== undefined) update.description = body.description;
    if (body.isActive !== undefined) update.is_active = body.isActive;
    await db('form_definitions').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Form definition updated');
  });

  app.get('/api/v1/forms/definitions/:id', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string };
    const def = await db('form_definitions').where({ id, tenant_id: tenantId }).first();
    if (!def) return reply.status(404).send({ success: false, error: 'Form definition not found' });
    return sendSuccess(reply, {
      id: def.id, name: def.name, slug: def.slug, category: def.category,
      schema: def.schema, uiSchema: def.ui_schema, isActive: def.is_active,
      description: def.description, version: def.version,
      createdAt: def.created_at, updatedAt: def.updated_at
    });
  });

  // Form Submissions
  app.get('/api/v1/forms/submissions', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { formId, patientId } = request.query as { formId?: string; patientId?: string };
    let q = db('form_submissions').where('form_submissions.tenant_id', tenantId);
    if (formId) q = q.andWhere('form_id', formId);
    if (patientId) q = q.andWhere('form_submissions.patient_id', patientId);
    const subs = await q.leftJoin('form_definitions', 'form_submissions.form_id', 'form_definitions.id')
      .leftJoin('patients', 'form_submissions.patient_id', 'patients.id')
      .select('form_submissions.*', 'form_definitions.name as form_name', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, subs.map((s: Record<string, unknown>) => ({
      id: s.id, formId: s.form_id, formName: s.form_name,
      patientId: s.patient_id, patientName: s.pf ? s.pf + ' ' + s.pl : null,
      data: s.data, status: s.status, submittedBy: s.submitted_by,
      submittedAt: s.submitted_at, createdAt: s.created_at
    })));
  });

  app.post('/api/v1/forms/submissions', { preHandler: [authenticate, authorize('forms.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [sub] = await db('form_submissions').insert({
      tenant_id: tenantId, form_id: body.formId, patient_id: body.patientId || null,
      appointment_id: body.appointmentId || null, data: JSON.stringify(body.data),
      status: body.status || 'completed', submitted_by: ctx.userId
    }).returning('*');
    return sendSuccess(reply, { id: sub.id, status: sub.status }, 'Form submitted', 201);
  });
}
