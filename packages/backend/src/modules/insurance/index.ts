import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, hasPermission } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';

interface InsuranceCompanyRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  contract_type: string;
  discount_rate: number;
  coverage_plans: unknown;
}

export async function registerInsuranceModule(app: FastifyInstance) {
  const resolveInsuranceScope = (principal: { grants: Array<{ permission: string; scope: PermissionScope }> }, permission = 'insurance.view'): PermissionScope =>
    principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';

  app.get('/api/v1/insurance/companies', { preHandler: [authenticate, authorize('insurance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const companies = await db('insurance_companies').where({ tenant_id: tenantId, is_active: true }).orderBy('name');
    return sendSuccess(reply, companies.map((c: InsuranceCompanyRow) => ({ id: c.id, name: c.name, code: c.code, contractType: c.contract_type, discountRate: Number(c.discount_rate), coveragePlans: c.coverage_plans })));
  });

  app.post('/api/v1/insurance/companies', { preHandler: [authenticate, authorize('insurance.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [co] = await db('insurance_companies').insert({ tenant_id: tenantId, name: body.name, code: body.code, contract_type: body.contractType || 'network', discount_rate: body.discountRate || 0 }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'insurance.company_created', entityType: 'insurance_company', entityId: co.id, metadata: { name: body.name }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, co, 'Insurance company added', 201);
  });

  app.get('/api/v1/insurance/claims', { preHandler: [authenticate, authorize('insurance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status } = request.query as { status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveInsuranceScope(principal, 'insurance.view');
    let q = db('insurance_claims').leftJoin('patients', 'insurance_claims.patient_id', 'patients.id').where('insurance_claims.tenant_id', tenantId).whereNull('insurance_claims.deleted_at');
    q = applyScopePolicy('insurance_claims', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('insurance_claims.status', status);
    const claims = await q.select('insurance_claims.*').orderBy('insurance_claims.created_at', 'desc').limit(50);
    return sendSuccess(reply, claims);
  });

  app.post('/api/v1/insurance/claims', { preHandler: [authenticate, authorize('insurance_claims.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const claimNum = "CLM-" + Date.now().toString(36).toUpperCase();
    const [claim] = await db('insurance_claims').insert({ tenant_id: tenantId, patient_id: body.patientId, invoice_id: body.invoiceId || null, insurance_id: body.insuranceId, claim_number: claimNum, claimed_amount: body.claimedAmount || 0, created_by: ctx.userId }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'insurance.claim_created', entityType: 'insurance_claim', entityId: claim.id, metadata: { claimNumber: claimNum }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, claim, 'Claim submitted', 201);
  });

  app.put('/api/v1/insurance/claims/:id', { preHandler: [authenticate, authorize('insurance_claims.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const principal = getCtx(request).principal;
    const requiresApproval = body.status === 'approved' || body.status === 'rejected' || body.approvedAmount !== undefined;
    if (requiresApproval && !hasPermission(principal, body.status === 'rejected' ? 'insurance_claims.reject' : 'insurance_claims.approve', 'branch')) {
      throw new ForbiddenError('Insurance claim approval permission is required for final claim decisions');
    }
    const scope = resolveInsuranceScope(principal, requiresApproval ? (body.status === 'rejected' ? 'insurance_claims.reject' : 'insurance_claims.approve') : 'insurance_claims.edit');
    const accessible = await applyScopePolicy('insurance_claims', db('insurance_claims').leftJoin('patients', 'insurance_claims.patient_id', 'patients.id').where({ 'insurance_claims.id': id, 'insurance_claims.tenant_id': tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this insurance claim');
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.approvedAmount !== undefined) update.approved_amount = body.approvedAmount;
    if (body.claimResponse) update.claim_response = body.claimResponse;
    await db('insurance_claims').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({ tenantId, userId: ctx.userId, action: 'insurance.claim_updated', entityType: 'insurance_claim', entityId: id, metadata: { status: body.status }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Claim updated');
  });
}
