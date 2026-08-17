import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { PatientNotFoundError } from '@healthcare/shared/errors';
import { authenticate } from '../auth-guard.js';
import { authorize, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';

interface LabCatalogRow {
  id: string;
  tenant_id: string;
  test_code: string;
  test_name: string;
  category: string;
  specimen_type: string;
  reference_range: string | null;
  unit: string | null;
  price: number;
}

interface LabOrderRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  order_number: string;
  status: string;
  priority: string;
  order_date: string;
  clinical_notes: string | null;
  results_summary: string | null;
  collected_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  p_first?: string;
  p_last?: string;
  medical_record_number?: string;
}

export async function registerLaboratoryModule(app: FastifyInstance) {
  const resolveLabScope = (principal: Principal, permission = 'laboratory.view'): PermissionScope =>
    principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';

  app.get('/api/v1/lab/catalog', { preHandler: [authenticate, authorize('laboratory.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const catalog = await db('lab_catalog').where({ tenant_id: tenantId, is_active: true }).orderBy('test_name');
    return sendSuccess(reply, catalog.map((c: LabCatalogRow) => ({
      id: c.id, testCode: c.test_code, testName: c.test_name,
      category: c.category, specimenType: c.specimen_type,
      referenceRange: c.reference_range, unit: c.unit, price: Number(c.price),
    })));
  });

  app.post('/api/v1/lab/catalog', { preHandler: [authenticate, authorize('laboratory.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [item] = await db('lab_catalog').insert({
      tenant_id: tenantId, test_code: body.testCode, test_name: body.testName,
      category: body.category, specimen_type: body.specimenType,
      reference_range: body.referenceRange, unit: body.unit, price: body.price || 0,
    }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'lab.catalog_created', entityType: 'lab_catalog', entityId: item.id, metadata: { testName: body.testName }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, item, 'Lab test added', 201);
  });

  app.get('/api/v1/lab/orders', { preHandler: [authenticate, authorize('laboratory.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, patientId } = request.query as { patientId?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveLabScope(principal);
    let q = db('lab_orders').join('patients', 'lab_orders.patient_id', 'patients.id').where('lab_orders.tenant_id', tenantId).whereNull('lab_orders.deleted_at');
    q = applyScopePolicy('laboratory', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('lab_orders.status', status);
    if (patientId) q = q.andWhere('lab_orders.patient_id', patientId);
    const orders = await q.select('lab_orders.*', 'patients.first_name as p_first', 'patients.last_name as p_last', 'patients.medical_record_number')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, orders.map(mapLabOrder));
  });

  app.post('/api/v1/lab/orders', { preHandler: [authenticate, authorize('laboratory.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenantId }).first();
    if (!patient) throw new PatientNotFoundError(String(body.patientId));
    const orderNum = "LAB-" + Date.now().toString(36).toUpperCase();
    const [order] = await db('lab_orders').insert({
      tenant_id: tenantId, patient_id: body.patientId, doctor_id: ctx.userId,
      appointment_id: body.appointmentId || null, order_number: orderNum,
      priority: body.priority || 'routine', order_date: new Date().toISOString().split('T')[0],
      clinical_notes: body.clinicalNotes, created_by: ctx.userId,
    }).returning('*');
    if (Array.isArray(body.tests) && body.tests.length) {
      const testRows = (body.tests as Record<string, unknown>[]).map((t) => ({
        order_id: order.id, test_code: t.testCode || t.code, test_name: t.testName || t.name,
        specimen_type: t.specimenType, reference_range: t.referenceRange, result_unit: t.unit,
      }));
      await db('lab_tests').insert(testRows);
    }

    await logAudit({ tenantId, userId: ctx.userId, action: 'lab.order_created', entityType: 'lab_order', entityId: order.id, metadata: { orderNumber: orderNum }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, { id: order.id, orderNumber: order.order_number }, 'Lab order created', 201);
  });

  app.put('/api/v1/lab/orders/:id/status', { preHandler: [authenticate, authorize('laboratory.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const scope = resolveLabScope(principal, 'laboratory.edit');
    const accessible = await applyScopePolicy('laboratory', db('lab_orders').join('patients', 'lab_orders.patient_id', 'patients.id').where({ 'lab_orders.id': id, 'lab_orders.tenant_id': tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this lab order');
    const update: Record<string, unknown> = { status: body.status, updated_at: new Date() };
    if (body.status === "collected") update.collected_at = new Date();
    if (body.status === "completed") update.completed_at = new Date();
    if (body.resultsSummary) update.results_summary = body.resultsSummary;
    await db('lab_orders').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({ tenantId, userId: ctx.userId, action: 'lab.order_status_updated', entityType: 'lab_order', entityId: id, metadata: { status: body.status }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, "Lab order updated");
  });

  app.post('/api/v1/lab/orders/:id/results', { preHandler: [authenticate, authorize('laboratory.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { tests } = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const scope = resolveLabScope(principal, 'laboratory.edit');
    const accessible = await applyScopePolicy('laboratory', db('lab_orders').join('patients', 'lab_orders.patient_id', 'patients.id').where({ 'lab_orders.id': id, 'lab_orders.tenant_id': tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this lab order');
    if (Array.isArray(tests) && tests.length) {
      for (const t of tests) {
        await db('lab_tests').where({ id: (t as Record<string, unknown>).id }).update({ result_value: (t as Record<string, unknown>).resultValue, status: (t as Record<string, unknown>).status || 'completed', notes: (t as Record<string, unknown>).notes });
      }
    }
    await db('lab_orders').where({ id, tenant_id: tenantId }).update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });

    await logAudit({ tenantId, userId: ctx.userId, action: 'lab.results_saved', entityType: 'lab_order', entityId: id, metadata: { testCount: Array.isArray(tests) ? tests.length : 0 }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Results saved');
  });
}

function mapLabOrder(o: LabOrderRow) {
  return {
    id: o.id, orderNumber: o.order_number, patientId: o.patient_id,
    patientName: `${o.p_first || ''} ${o.p_last || ''}`.trim(), patientMrn: o.medical_record_number,
    doctorId: o.doctor_id, status: o.status, priority: o.priority,
    orderDate: o.order_date, clinicalNotes: o.clinical_notes,
    resultsSummary: o.results_summary, collectedAt: o.collected_at,
    completedAt: o.completed_at, createdAt: o.created_at,
  };
}
