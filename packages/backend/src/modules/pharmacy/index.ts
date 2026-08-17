import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, canAccessPatient, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';

interface PharmacyInventoryRow {
  id: string;
  tenant_id: string;
  drug_name: string;
  generic_name: string | null;
  brand_name: string | null;
  dosage_form: string | null;
  strength: string | null;
  stock_quantity: number;
  reorder_level: number;
  unit_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  manufacturer: string | null;
  requires_prescription: boolean;
  status: string;
}

export function resolvePharmacyScope(principal: Principal, permission = 'pharmacy.view'): PermissionScope {
  return principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';
}

interface PharmacyPrescriptionItemRow {
  id: string;
  prescription_id: string;
  drug_name: string;
  dosage: string;
  route: string | null;
  frequency: string;
  duration: string | null;
  quantity: number;
  quantity_dispensed: number;
  refills: number;
  instructions: string | null;
  status: string;
}

export async function registerPharmacyModule(app: FastifyInstance) {
  // Inventory
  app.get('/api/v1/pharmacy/inventory', { preHandler: [authenticate, authorize('pharmacy.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { search, status } = request.query as { search?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolvePharmacyScope(principal);
    let q = db('pharmacy_inventory').where({ tenant_id: tenantId });
    q = applyScopePolicy('pharmacy_inventory', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('status', status);
    if (search) q = q.andWhere(function() { this.where('drug_name', 'ilike', '%'+search+'%').orWhere('generic_name', 'ilike', '%'+search+'%'); });
    const items = await q.orderBy('drug_name');
    return sendSuccess(reply, items.map(mapDrug));
  });

  app.post('/api/v1/pharmacy/inventory', { preHandler: [authenticate, authorize('pharmacy.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [item] = await db('pharmacy_inventory').insert({
      tenant_id: tenantId, drug_name: body.drugName, generic_name: body.genericName,
      brand_name: body.brandName, dosage_form: body.dosageForm, strength: body.strength,
      stock_quantity: body.stockQuantity || 0, reorder_level: body.reorderLevel || 10,
      unit_price: body.unitPrice || 0, batch_number: body.batchNumber,
      expiry_date: body.expiryDate, manufacturer: body.manufacturer,
      requires_prescription: body.requiresPrescription !== false,
    }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.drug_added', entityType: 'pharmacy_inventory', entityId: item.id, metadata: { drugName: body.drugName }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, mapDrug(item), 'Drug added', 201);
  });

  app.put('/api/v1/pharmacy/inventory/:id/stock', { preHandler: [authenticate, authorize('pharmacy.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { quantity } = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const scope = resolvePharmacyScope(principal, 'pharmacy.edit');
    const accessible = await applyScopePolicy('pharmacy_inventory', db('pharmacy_inventory').where({ id, tenant_id: tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this pharmacy inventory item');
    await db('pharmacy_inventory').where({ id, tenant_id: tenantId }).increment('stock_quantity', Number(quantity)).update({ updated_at: new Date() });

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.stock_updated', entityType: 'pharmacy_inventory', entityId: id, metadata: { quantity }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Stock updated');
  });

  // Prescriptions
  app.get('/api/v1/pharmacy/prescriptions', { preHandler: [authenticate, authorize('pharmacy.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, patientId } = request.query as { patientId?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolvePharmacyScope(principal);
    let q = db('pharmacy_prescriptions').join('patients', 'pharmacy_prescriptions.patient_id', 'patients.id').where('pharmacy_prescriptions.tenant_id', tenantId).whereNull('pharmacy_prescriptions.deleted_at');
    q = applyScopePolicy('pharmacy_prescriptions', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('pharmacy_prescriptions.status', status);
    if (patientId) q = q.andWhere('pharmacy_prescriptions.patient_id', patientId);
    const rows = await q.select('pharmacy_prescriptions.*', 'patients.first_name as p_first', 'patients.last_name as p_last')
      .orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, await Promise.all(rows.map(async (r: Record<string, unknown>) => {
      const items = await db('pharmacy_prescription_items').where({ prescription_id: r.id });
      return { id: r.id, prescriptionNumber: r.prescription_number, patientId: r.patient_id,
        patientName: `${r.p_first || ''} ${r.p_last || ''}`.trim(), status: r.status, notes: r.notes,
        items: items.map((i: PharmacyPrescriptionItemRow) => ({ id: i.id, drugName: i.drug_name, dosage: i.dosage,
          route: i.route, frequency: i.frequency, duration: i.duration, quantity: i.quantity,
          quantityDispensed: i.quantity_dispensed, refills: i.refills, instructions: i.instructions,
          status: i.status })), createdAt: r.created_at };
    })));
  });

  app.post('/api/v1/pharmacy/prescriptions', { preHandler: [authenticate, authorize('pharmacy.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenantId }).first();
    if (!patient || !(await canAccessPatient(ctx.principal, patient))) throw new ForbiddenError('You do not have access to this patient');
    const prescNum = "RX-" + Date.now().toString(36).toUpperCase();
    const [presc] = await db('pharmacy_prescriptions').insert({
      tenant_id: tenantId, patient_id: body.patientId, doctor_id: ctx.userId,
      emr_record_id: body.emrRecordId || null, prescription_number: prescNum,
      notes: body.notes, created_by: ctx.userId,
    }).returning('*');
    if (Array.isArray(body.items) && body.items.length) {
      await db('pharmacy_prescription_items').insert((body.items as Record<string, unknown>[]).map((i) => ({
        prescription_id: presc.id, drug_name: i.drugName, dosage: i.dosage,
        route: i.route, frequency: i.frequency, duration: i.duration,
        quantity: i.quantity, refills: i.refills || 0, instructions: i.instructions,
      })));
    }

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.prescription_created', entityType: 'pharmacy_prescription', entityId: presc.id, metadata: { prescriptionNumber: prescNum }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, { id: presc.id, prescriptionNumber: presc.prescription_number }, 'Prescription created', 201);
  });

  app.post('/api/v1/pharmacy/prescriptions/:id/dispense', { preHandler: [authenticate, authorize('pharmacy.approve')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { items } = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const scope = resolvePharmacyScope(principal, 'pharmacy.approve');
    const accessible = await applyScopePolicy('pharmacy_prescriptions', db('pharmacy_prescriptions').join('patients', 'pharmacy_prescriptions.patient_id', 'patients.id').where({ 'pharmacy_prescriptions.id': id, 'pharmacy_prescriptions.tenant_id': tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this prescription');
    if (Array.isArray(items) && items.length) {
      for (const it of items) {
        const item = it as Record<string, unknown>;
        await db('pharmacy_prescription_items').where({ id: item.id }).update({ quantity_dispensed: item.quantityDispensed, status: item.status || 'dispensed' });
        if (item.drugName) {
          await db('pharmacy_inventory').where({ drug_name: item.drugName, tenant_id: tenantId }).decrement('stock_quantity', Number(item.quantityDispensed) || 0);
        }
      }
    }
    await db('pharmacy_prescriptions').where({ id, tenant_id: tenantId }).update({ status: 'dispensed', updated_at: new Date() });

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.prescription_dispensed', entityType: 'pharmacy_prescription', entityId: id, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Prescription dispensed');
  });
}

function mapDrug(d: PharmacyInventoryRow) {
  return {
    id: d.id, drugName: d.drug_name, genericName: d.generic_name, brandName: d.brand_name,
    dosageForm: d.dosage_form, strength: d.strength, stockQuantity: d.stock_quantity,
    reorderLevel: d.reorder_level, unitPrice: Number(d.unit_price), batchNumber: d.batch_number,
    expiryDate: d.expiry_date, manufacturer: d.manufacturer, requiresPrescription: d.requires_prescription,
    status: d.status,
  };
}
