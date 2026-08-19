import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { z } from 'zod';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, canAccessPatient, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ConflictError, ForbiddenError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';
import { analyzePrescriptionSafety, findMedicationInteractions, safetyWarningsRequireOverride, normalizePharmacyName } from '../../services/pharmacy-safety.js';

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

export function resolvePharmacyInventoryBranchId(principal: Principal, permission = 'pharmacy.create'): string | null {
  const scope = resolvePharmacyScope(principal, permission);
  if (scope !== 'branch' && scope !== 'branches') return null;
  const activeBranchId = principal.membership?.branchId;
  if (activeBranchId && principal.branches.includes(activeBranchId)) return activeBranchId;
  if (principal.branches.length === 1) return principal.branches[0];
  throw new ForbiddenError('A branch-scoped pharmacy operation requires an active assigned branch');
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
  app.get('/api/v1/pharmacy/medication-reference', { preHandler: [authenticate, authorize('pharmacy.view')] }, async (request, reply) => {
    const query = z.object({ q: z.string().trim().max(200).optional() }).parse(request.query);
    let medicationQuery = db('medication_database').where('status', 'active');
    if (query.q) {
      const search = `%${query.q}%`;
      medicationQuery = medicationQuery.where(function() {
        this.where('generic_name', 'ilike', search).orWhere('brand_names', 'ilike', search).orWhere('category', 'ilike', search);
      });
    }
    const medications = await medicationQuery.orderBy('generic_name').limit(100);
    return sendSuccess(reply, medications.map((medication: Record<string, unknown>) => ({
      id: medication.id,
      name: medication.generic_name,
      category: medication.category,
      form: [medication.dosage_form, medication.strength].filter(Boolean).join(' '),
      genericName: medication.generic_name,
      brandNames: medication.brand_names,
      interactions: medication.interactions,
    })));
  });

  app.post('/api/v1/pharmacy/interactions/check', { preHandler: [authenticate, authorize('pharmacy.view')] }, async (request, reply) => {
    const body = z.object({ drugNames: z.array(z.string().trim().min(1).max(200)).min(2).max(20) }).parse(request.body);
    const references = await db('medication_database').where('status', 'active').where(function() {
      body.drugNames.forEach((drugName, index) => {
        if (index === 0) {
          this.where('generic_name', 'ilike', drugName).orWhere('brand_names', 'ilike', `%${drugName}%`);
        } else {
          this.orWhere('generic_name', 'ilike', drugName).orWhere('brand_names', 'ilike', `%${drugName}%`);
        }
      });
    }).select('generic_name', 'brand_names', 'category', 'interactions');
    const normalized = body.drugNames.map(normalizePharmacyName);
    const selected = references.filter((reference: Record<string, unknown>) => {
      const genericName = normalizePharmacyName(String(reference.generic_name || ''));
      const brandNames = String(reference.brand_names || '').split(/[,;|]/).map(normalizePharmacyName);
      return normalized.some((name) => name === genericName || brandNames.includes(name));
    });
    return sendSuccess(reply, { interactions: findMedicationInteractions(selected.map((reference: Record<string, unknown>) => ({
      genericName: String(reference.generic_name || ''),
      brandNames: String(reference.brand_names || ''),
      category: String(reference.category || ''),
      interactions: String(reference.interactions || ''),
    }))) });
  });

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
      tenant_id: tenantId, branch_id: resolvePharmacyInventoryBranchId(ctx.principal),
      drug_name: body.drugName, generic_name: body.genericName,
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

  app.post('/api/v1/pharmacy/prescriptions', { preHandler: [authenticate, authorize('pharmacy.prescribe')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = z.object({
      patientId: z.string().uuid(),
      emrRecordId: z.string().uuid().nullable().optional(),
      notes: z.string().max(4000).nullable().optional(),
      overrideReason: z.string().trim().min(5).max(1000).optional(),
      items: z.array(z.object({
        drugName: z.string().trim().min(1).max(200),
        dosage: z.string().trim().min(1).max(100),
        route: z.string().trim().max(100).nullable().optional(),
        frequency: z.string().trim().min(1).max(100),
        duration: z.string().trim().min(1).max(100),
        quantity: z.coerce.number().int().positive().max(100000),
        refills: z.coerce.number().int().nonnegative().max(20).default(0),
        instructions: z.string().trim().max(2000).nullable().optional(),
      })).min(1).max(50),
    }).parse(request.body);

    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenantId }).first();
    if (!patient || !(await canAccessPatient(ctx.principal, patient))) throw new ForbiddenError('You do not have access to this patient');

    const [allergies, activeMedications, medicationReferences] = await Promise.all([
      db('patient_allergies').where({ tenant_id: tenantId, patient_id: body.patientId }).select('allergen', 'severity', 'reaction'),
      db('patient_medications').where({ tenant_id: tenantId, patient_id: body.patientId, is_active: true }).select('medication_name'),
      db('medication_database').select('generic_name', 'brand_names', 'interactions'),
    ]);

    const warnings = [] as ReturnType<typeof analyzePrescriptionSafety>;
    for (const item of body.items) {
      const inventory = await db('pharmacy_inventory')
        .where({ tenant_id: tenantId })
        .where(function() {
          this.whereRaw('LOWER(drug_name) = LOWER(?)', [item.drugName])
            .orWhereRaw('LOWER(generic_name) = LOWER(?)', [item.drugName]);
        })
        .whereNot('status', 'discontinued')
        .first();
      const reference = medicationReferences.find((candidate: Record<string, unknown>) =>
        normalizePharmacyName(String(candidate.generic_name || '')) === normalizePharmacyName(item.drugName)
        || String(candidate.brand_names || '').split(/[,;|]/).some((brand) => normalizePharmacyName(brand) === normalizePharmacyName(item.drugName)));
      warnings.push(...analyzePrescriptionSafety({
        drugName: item.drugName,
        medicationReference: reference ? {
          genericName: String(reference.generic_name || ''),
          brandNames: String(reference.brand_names || ''),
          interactions: String(reference.interactions || ''),
        } : null,
        relatedMedicationReferences: medicationReferences.map((candidate: Record<string, unknown>) => ({
          genericName: String(candidate.generic_name || ''),
          brandNames: String(candidate.brand_names || ''),
          interactions: String(candidate.interactions || ''),
        })),
        patientAllergies: allergies,
        activeMedications,
        existsInTenantCatalog: Boolean(inventory || reference),
      }));
    }

    const canOverride = hasPharmacyPermission(ctx.principal, 'pharmacy.override');
    if (safetyWarningsRequireOverride(warnings) && (!body.overrideReason || !canOverride)) {
      return reply.status(409).send({
        success: false,
        code: 'PHARMACY_CLINICAL_WARNING',
        error: 'Prescription requires an authorized clinical override.',
        warnings,
      });
    }

    const prescNum = `RX-${Date.now().toString(36).toUpperCase()}`;
    const [presc] = await db('pharmacy_prescriptions').insert({
      tenant_id: tenantId, patient_id: body.patientId, doctor_id: ctx.userId,
      emr_record_id: body.emrRecordId || null, prescription_number: prescNum,
      notes: body.notes || null, clinical_override_reason: body.overrideReason || null, created_by: ctx.userId,
    }).returning('*');
    await db('pharmacy_prescription_items').insert(body.items.map((item) => ({
      prescription_id: presc.id, drug_name: item.drugName, dosage: item.dosage,
      route: item.route || null, frequency: item.frequency, duration: item.duration,
      quantity: item.quantity, refills: item.refills, instructions: item.instructions || null,
    })));

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.prescription_created', entityType: 'pharmacy_prescription', entityId: presc.id, metadata: { prescriptionNumber: prescNum, warningCount: warnings.length, override: Boolean(body.overrideReason) }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, { id: presc.id, prescriptionNumber: presc.prescription_number, clinicalWarnings: warnings }, 'Prescription created', 201);
  });

  app.post('/api/v1/pharmacy/prescriptions/:id/dispense', { preHandler: [authenticate, authorize('pharmacy.dispense')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = z.object({
      idempotencyKey: z.string().trim().min(8).max(160).optional(),
      overrideReason: z.string().trim().min(5).max(1000).optional(),
      items: z.array(z.object({ id: z.string().uuid(), quantity: z.coerce.number().int().positive() })).default([]),
    }).parse(request.body || {});
    const headerKey = request.headers['idempotency-key'];
    const idempotencyKey = String(body.idempotencyKey || (Array.isArray(headerKey) ? headerKey[0] : headerKey) || '').trim();
    if (!idempotencyKey) {
      return reply.status(400).send({ success: false, code: 'PHARMACY_IDEMPOTENCY_REQUIRED', error: 'An idempotency key is required for dispensing.' });
    }

    const principal = ctx.principal;
    const scope = resolvePharmacyScope(principal, 'pharmacy.dispense');
    const branchId = resolvePharmacyInventoryBranchId(principal, 'pharmacy.dispense');
    const result = await db.transaction(async (trx) => {
      const existingRequest = await trx('pharmacy_dispense_requests')
        .where({ tenant_id: tenantId, idempotency_key: idempotencyKey })
        .first();
      if (existingRequest) {
        if (String(existingRequest.prescription_id) !== id) {
          throw new ForbiddenError('This idempotency key belongs to another prescription');
        }
        return { requestId: existingRequest.id, idempotent: true, status: existingRequest.status, dispensedItems: [] };
      }

      const accessible = await applyScopePolicy(
        'pharmacy_prescriptions',
        trx('pharmacy_prescriptions')
          .join('patients', 'pharmacy_prescriptions.patient_id', 'patients.id')
          .where({ 'pharmacy_prescriptions.id': id, 'pharmacy_prescriptions.tenant_id': tenantId })
          .whereNull('pharmacy_prescriptions.deleted_at')
          .select('pharmacy_prescriptions.*'),
        principal,
        scope,
      ).forUpdate().first();
      if (!accessible) throw new ForbiddenError('You do not have access to this prescription');
      if (['cancelled', 'expired', 'dispensed'].includes(String(accessible.status))) {
        throw new ConflictError(`Prescription cannot be dispensed from status ${accessible.status}`);
      }

      const prescriptionItems = await trx('pharmacy_prescription_items')
        .where({ prescription_id: id })
        .whereNotIn('status', ['cancelled'])
        .forUpdate();
      if (prescriptionItems.length === 0) throw new ConflictError('Prescription has no dispensable items');

      const requested = new Map(body.items.map((item) => [item.id, item.quantity]));
      const selectedItems = prescriptionItems.filter((item: Record<string, unknown>) => {
        const remaining = Number(item.quantity) - Number(item.quantity_dispensed || 0);
        return remaining > 0 && (requested.size === 0 || requested.has(String(item.id)));
      });
      if (selectedItems.length === 0) throw new ConflictError('No remaining prescription items were selected');
      if (requested.size > 0 && selectedItems.length !== requested.size) throw new ConflictError('One or more selected prescription items are invalid');

      const [dispenseRequest] = await trx('pharmacy_dispense_requests').insert({
        tenant_id: tenantId, prescription_id: id, patient_id: accessible.patient_id,
        idempotency_key: idempotencyKey, status: 'running',
        override_reason: body.overrideReason || null, dispensed_by: ctx.userId,
      }).returning('*');

      const dispensedItems: Array<Record<string, unknown>> = [];
      for (const prescriptionItem of selectedItems) {
        const remaining = Number(prescriptionItem.quantity) - Number(prescriptionItem.quantity_dispensed || 0);
        const quantity = requested.get(String(prescriptionItem.id)) ?? remaining;
        if (quantity < 1 || quantity > remaining) throw new ConflictError(`Dispense quantity exceeds the remaining quantity for ${prescriptionItem.drug_name}`);

        let inventoryQuery = trx('pharmacy_inventory')
          .where({ tenant_id: tenantId })
          .where(function() {
            this.whereRaw('LOWER(drug_name) = LOWER(?)', [prescriptionItem.drug_name])
              .orWhereRaw('LOWER(generic_name) = LOWER(?)', [prescriptionItem.drug_name]);
          })
          .whereNot('status', 'discontinued')
          .where('stock_quantity', '>=', quantity)
          .where(function() {
            this.whereNull('expiry_date').orWhere('expiry_date', '>=', trx.raw('CURRENT_DATE'));
          });
        inventoryQuery = applyScopePolicy('pharmacy_inventory', inventoryQuery, principal, scope) as typeof inventoryQuery;
        const inventory = await inventoryQuery.orderByRaw('expiry_date IS NULL ASC').orderBy('expiry_date', 'asc').forUpdate().first();
        if (!inventory) throw new ConflictError(`Insufficient, unavailable, or expired stock for ${prescriptionItem.drug_name}`);
        if (branchId && inventory.branch_id && String(inventory.branch_id) !== branchId) throw new ForbiddenError('Inventory is outside the active pharmacy branch');

        const updatedInventory = await trx('pharmacy_inventory')
          .where({ id: inventory.id, tenant_id: tenantId })
          .where('stock_quantity', '>=', quantity)
          .decrement('stock_quantity', quantity)
          .update({ status: Number(inventory.stock_quantity) - quantity === 0 ? 'out_of_stock' : 'active', updated_at: new Date() });
        if (updatedInventory !== 1) throw new ConflictError(`Stock changed while dispensing ${prescriptionItem.drug_name}; please retry`);

        await trx('pharmacy_dispense_records').insert({
          tenant_id: tenantId, request_id: dispenseRequest.id, prescription_id: id,
          prescription_item_id: prescriptionItem.id, inventory_id: inventory.id,
          quantity, batch_number: inventory.batch_number, expiry_date: inventory.expiry_date,
          unit_price: inventory.unit_price || 0, dispensed_by: ctx.userId,
        });

        const dispensedQuantity = Number(prescriptionItem.quantity_dispensed || 0) + quantity;
        await trx('pharmacy_prescription_items').where({ id: prescriptionItem.id, prescription_id: id }).update({
          quantity_dispensed: dispensedQuantity,
          status: dispensedQuantity >= Number(prescriptionItem.quantity) ? 'dispensed' : 'partially_dispensed',
        });
        dispensedItems.push({ itemId: prescriptionItem.id, drugName: prescriptionItem.drug_name, quantity, inventoryId: inventory.id, batchNumber: inventory.batch_number });
      }

      const remainingItems = await trx('pharmacy_prescription_items').where({ prescription_id: id }).whereNotIn('status', ['cancelled']).whereRaw('quantity_dispensed < quantity').count('id as count').first();
      const nextStatus = Number(remainingItems?.count || 0) === 0 ? 'dispensed' : 'partially_dispensed';
      await trx('pharmacy_prescriptions').where({ id, tenant_id: tenantId }).update({ status: nextStatus, updated_at: new Date() });
      await trx('pharmacy_dispense_requests').where({ id: dispenseRequest.id, tenant_id: tenantId }).update({ status: 'completed', updated_at: new Date() });
      return { requestId: dispenseRequest.id, idempotent: false, status: nextStatus, dispensedItems };
    });

    await logAudit({ tenantId, userId: ctx.userId, action: 'pharmacy.prescription_dispensed', entityType: 'pharmacy_prescription', entityId: id, metadata: result, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, result, result.idempotent ? 'Dispense request already completed' : 'Prescription dispensed');
  });
}

function hasPharmacyPermission(principal: Principal, permission: string): boolean {
  return principal.grants.some((grant) => grant.effect !== 'DENY' && (grant.permission === '*' || permissionKeyMatches(grant.permission, permission)));
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
