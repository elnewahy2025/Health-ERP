import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import type { InsuranceCompanyRow, InsuranceClaimRow } from "../types.js";
import { logAudit } from '../../services/audit.js';
import { authenticate } from '../auth-guard.js';

export async function registerInsuranceClaimsModule(app: FastifyInstance) {

  app.get('/api/v1/insurance-companies', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const companies = await db('insurance_companies').where({ tenant_id: tenantId, is_active: true }).orderBy('name');
    return sendSuccess(reply, companies.map((c: InsuranceCompanyRow) => ({
      id: c.id, name: c.name, code: c.code, contractType: c.contract_type,
      discountRate: Number(c.discount_rate), coveragePlans: c.coverage_plans,
    })));
  });

  app.post('/api/v1/insurance-companies', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      name: z.string().min(2), code: z.string().min(2).max(50),
      contractType: z.string().optional().default('network'),
      discountRate: z.number().min(0).max(100).optional().default(0),
    }).parse(request.body);
    const [company] = await db('insurance_companies').insert({
      tenant_id: tenantId, name: body.name, code: body.code,
      contract_type: body.contractType, discount_rate: body.discountRate,
    }).returning('*');
    return sendSuccess(reply, { id: company.id, name: company.name }, 'Company created', 201);
  });

  app.get('/api/v1/insurance-claims', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const query = z.object({ page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20), status: z.string().optional(), insuranceId: z.string().uuid().optional(), patientId: z.string().uuid().optional() }).parse(request.query);
    const qb = db('insurance_claims').leftJoin('patients', 'insurance_claims.patient_id', 'patients.id').leftJoin('insurance_companies', 'insurance_claims.insurance_id', 'insurance_companies.id').leftJoin('invoices', 'insurance_claims.invoice_id', 'invoices.id').where('insurance_claims.tenant_id', tenantId).whereNull('insurance_claims.deleted_at');
    if (query.status) qb.andWhere('insurance_claims.status', query.status);
    if (query.insuranceId) qb.andWhere('insurance_claims.insurance_id', query.insuranceId);
    if (query.patientId) qb.andWhere('insurance_claims.patient_id', query.patientId);
    const total = await qb.clone().count('insurance_claims.id as count').first();
    const claims = await qb.select('insurance_claims.*', 'patients.first_name as pf', 'patients.last_name as pl', 'patients.medical_record_number as mrn', 'insurance_companies.name as cname', 'invoices.invoice_number', 'invoices.total as inv_total').orderBy('insurance_claims.created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);
    return sendPaginated(reply, claims.map((c: Record<string, unknown>) => ({ id: c.id, claimNumber: c.claim_number, status: c.status, patientName: c.pf ? `${c.pf} ${c.pl}` : null, patientMrn: c.mrn, companyName: c.cname, invoiceNumber: c.invoice_number, claimedAmount: Number(c.claimed_amount), approvedAmount: Number(c.approved_amount), paidAmount: Number(c.paid_amount), submissionDate: c.submission_date, responseDate: c.response_date, denialReason: c.denial_reason, notes: c.notes, createdAt: c.created_at })), Number((total as Record<string, unknown>)?.count || 0), query.page, query.limit);
  });

  app.post('/api/v1/insurance-claims', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const body = z.object({ patientId: z.string().uuid(), invoiceId: z.string().uuid(), insuranceId: z.string().uuid(), claimedAmount: z.number().positive(), notes: z.string().optional() }).parse(request.body);
    const count = await db('insurance_claims').where({ tenant_id: tenantId }).count('id as c').first();
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(Number((count as Record<string, unknown>)?.c || 0) + 1).padStart(5, '0')}`;
    const [claim] = await db('insurance_claims').insert({ tenant_id: tenantId, patient_id: body.patientId, invoice_id: body.invoiceId, insurance_id: body.insuranceId, claim_number: claimNumber, status: 'draft', claimed_amount: body.claimedAmount, notes: body.notes, created_by: ctx.userId }).returning('*');
    await db('invoices').where({ id: body.invoiceId }).update({ insurance_claim: claimNumber });
    await logAudit({ tenantId, userId: ctx.userId, action: 'claim.create', entityType: 'insurance_claim', entityId: claim.id });
    return sendSuccess(reply, { id: claim.id, claimNumber }, 'Claim created', 201);
  });

  app.post('/api/v1/insurance-claims/:id/submit', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const claim = await db('insurance_claims').where({ id }).first();
    if (!claim) return reply.code(404).send({ error: 'Not found' });
    if (claim.status !== 'draft') return reply.code(400).send({ error: 'Only draft claims can be submitted' });
    await db('insurance_claims').where({ id }).update({ status: 'submitted', submission_date: new Date().toISOString().split('T')[0], updated_at: new Date() });
    return sendSuccess(reply, { message: 'Claim submitted' });
  });

  app.patch('/api/v1/insurance-claims/:id/status', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { status, approvedAmount, paidAmount, denialReason } = z.object({ status: z.enum(['acknowledged', 'in_review', 'approved', 'denied', 'paid']), approvedAmount: z.number().optional(), paidAmount: z.number().optional(), denialReason: z.string().optional() }).parse(request.body);
    const update: Record<string, unknown> = { status, updated_at: new Date() };
    if (approvedAmount !== undefined) update.approved_amount = approvedAmount;
    if (paidAmount !== undefined) update.paid_amount = paidAmount;
    if (denialReason) update.denial_reason = denialReason;
    if (['approved', 'denied'].includes(status)) update.response_date = new Date().toISOString().split('T')[0];
    await db('insurance_claims').where({ id }).update(update);
    if (status === 'approved' && approvedAmount) {
      const claim = await db('insurance_claims').where({ id }).first();
      if (claim?.invoice_id) await db('invoices').where({ id: claim.invoice_id }).update({ paid: approvedAmount, due: db.raw('GREATEST(total - ?, 0)', [approvedAmount]), status: db.raw('CASE WHEN ? >= total THEN ? ELSE ? END', [approvedAmount, 'paid', 'partial']) });
    }
    await logAudit({ tenantId: (await db('insurance_claims').where({ id }).first()).tenant_id, action: `claim.${status}`, entityType: 'insurance_claim', entityId: id });
    return sendSuccess(reply, { message: `Claim ${status}` });
  });

  app.get('/api/v1/insurance-claims/summary', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const s = await db('insurance_claims').where({ tenant_id: tenantId }).whereNull('deleted_at').select(db.raw('COUNT(*) as total'), db.raw('COALESCE(SUM(claimed_amount),0) as total_claimed'), db.raw('COALESCE(SUM(approved_amount),0) as total_approved'), db.raw('COALESCE(SUM(paid_amount),0) as total_paid'), db.raw('COUNT(CASE WHEN status=\'draft\' THEN 1 END) as draft'), db.raw('COUNT(CASE WHEN status=\'submitted\' THEN 1 END) as submitted'), db.raw('COUNT(CASE WHEN status=\'approved\' THEN 1 END) as approved'), db.raw('COUNT(CASE WHEN status=\'denied\' THEN 1 END) as denied'), db.raw('COUNT(CASE WHEN status=\'paid\' THEN 1 END) as paid')).first();
    return sendSuccess(reply, s);
  });
}
