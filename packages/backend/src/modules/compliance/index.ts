import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, canAccessPatient, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import type { PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';

interface CompliancePolicyRow {
  id: string;
  tenant_id: string;
  title: string;
  code: string;
  category: string | null;
  description: string | null;
  content: string | null;
  status: string;
  effective_date: string | null;
  review_date: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ComplianceAuditRow {
  id: string;
  tenant_id: string;
  title: string;
  type: string;
  status: string;
  scheduled_date: string | null;
  completed_date: string | null;
  scope: string | null;
  findings: string | null;
  recommendations: string | null;
  auditor: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface DataConsentLogRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  consent_type: string;
  granted: boolean;
  details: string | null;
  ip_address: string | null;
  consented_at: Date;
  pf?: string;
  pl?: string;
}

interface BreachLogRow {
  id: string;
  tenant_id: string;
  type: string;
  detected_date: string;
  reported_date: string | null;
  severity: string;
  description: string;
  affected_data: string | null;
  affected_records: number;
  action_taken: string | null;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function registerComplianceModule(app: FastifyInstance) {
  const resolveComplianceScope = (principal: Principal): PermissionScope =>
    principal.grants.find((grant) => grant.permission === 'compliance.view' || grant.permission === '*')?.scope || 'tenant';

  // Policies
  app.get('/api/v1/compliance/policies', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { category, status } = request.query as { category?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveComplianceScope(principal);
    let q = db('compliance_policies').where('compliance_policies.tenant_id', tenantId);
    q = applyScopePolicy('compliance', q, principal, scope) as typeof q;
    if (category) q = q.andWhere('category', category);
    if (status) q = q.andWhere('status', status);
    const policies = await q.orderBy('title');
    return sendSuccess(reply, policies.map((p: CompliancePolicyRow) => ({
      id: p.id, title: p.title, code: p.code, category: p.category,
      description: p.description, content: p.content, status: p.status,
      effectiveDate: p.effective_date, reviewDate: p.review_date,
      createdAt: p.created_at, updatedAt: p.updated_at,
    })));
  });

  app.post('/api/v1/compliance/policies', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [pol] = await db('compliance_policies').insert({
      tenant_id: tenantId, title: body.title, code: body.code,
      category: body.category || 'general', description: body.description || null,
      content: body.content || null, status: body.status || 'draft',
      effective_date: body.effectiveDate || null, review_date: body.reviewDate || null,
      created_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.policy_created', entityType: 'compliance_policy', entityId: pol.id,
      metadata: { title: body.title, code: body.code, category: body.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: pol.id, code: pol.code, title: pol.title }, 'Policy created', 201);
  });

  app.put('/api/v1/compliance/policies/:id', { preHandler: [authenticate, authorize('compliance.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.title) update.title = body.title;
    if (body.category) update.category = body.category;
    if (body.description !== undefined) update.description = body.description;
    if (body.content !== undefined) update.content = body.content;
    if (body.status) update.status = body.status;
    if (body.effectiveDate) update.effective_date = body.effectiveDate;
    if (body.reviewDate) update.review_date = body.reviewDate;
    await db('compliance_policies').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.policy_updated', entityType: 'compliance_policy', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Policy updated');
  });

  // Audits
  app.get('/api/v1/compliance/audits', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, type } = request.query as { status?: string; type?: string };
    const principal = getCtx(request).principal;
    const scope = resolveComplianceScope(principal);
    let q = db('compliance_audits').where('compliance_audits.tenant_id', tenantId);
    q = applyScopePolicy('compliance', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('status', status);
    if (type) q = q.andWhere('type', type);
    const audits = await q.orderBy('scheduled_date', 'desc').limit(50);
    return sendSuccess(reply, audits.map((a: ComplianceAuditRow) => ({
      id: a.id, title: a.title, type: a.type, status: a.status,
      scheduledDate: a.scheduled_date, completedDate: a.completed_date,
      scope: a.scope, findings: a.findings, recommendations: a.recommendations,
      auditor: a.auditor, createdAt: a.created_at, updatedAt: a.updated_at,
    })));
  });

  app.post('/api/v1/compliance/audits', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [audit] = await db('compliance_audits').insert({
      tenant_id: tenantId, title: body.title, type: body.type || 'internal',
      status: body.status || 'planned', scheduled_date: body.scheduledDate || null,
      scope: body.scope || null, auditor: body.auditor || null, created_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.audit_created', entityType: 'compliance_audit', entityId: audit.id,
      metadata: { title: body.title, type: body.type },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: audit.id, title: audit.title }, 'Audit created', 201);
  });

  app.put('/api/v1/compliance/audits/:id', { preHandler: [authenticate, authorize('compliance.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.title) update.title = body.title;
    if (body.status) update.status = body.status;
    if (body.scope !== undefined) update.scope = body.scope;
    if (body.findings !== undefined) update.findings = body.findings;
    if (body.recommendations !== undefined) update.recommendations = body.recommendations;
    if (body.auditor !== undefined) update.auditor = body.auditor;
    if (body.status === 'completed') update.completed_date = new Date().toISOString().split('T')[0];
    await db('compliance_audits').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.audit_updated', entityType: 'compliance_audit', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Audit updated');
  });

  // Consent Logs
  app.get('/api/v1/compliance/consents', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { patientId } = request.query as { patientId?: string };
    const principal = getCtx(request).principal;
    const scope = resolveComplianceScope(principal);
    let q = db('data_consent_logs').where('data_consent_logs.tenant_id', tenantId);
    q = q.leftJoin('patients', 'data_consent_logs.patient_id', 'patients.id');
    q = applyScopePolicy('compliance_consent', q, principal, scope) as typeof q;
    if (patientId) q = q.andWhere('data_consent_logs.patient_id', patientId);
    const consents = await q.select('data_consent_logs.*', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('consented_at', 'desc').limit(50);
    return sendSuccess(reply, consents.map((c: DataConsentLogRow) => ({
      id: c.id, patientId: c.patient_id, patientName: `${c.pf || ''} ${c.pl || ''}`.trim(),
      consentType: c.consent_type, granted: c.granted, details: c.details,
      ipAddress: c.ip_address, consentedAt: c.consented_at,
    })));
  });

  app.post('/api/v1/compliance/consents', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const patient = await db('patients').where({ id: body.patientId, tenant_id: tenantId }).first();
    if (!patient || !(await canAccessPatient(ctx.principal, patient))) throw new ForbiddenError('You do not have access to this patient');
    const [consent] = await db('data_consent_logs').insert({
      tenant_id: tenantId, patient_id: body.patientId,
      consent_type: body.consentType, granted: body.granted !== false,
      details: body.details || null, ip_address: body.ipAddress || null,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.consent_logged', entityType: 'data_consent_log', entityId: consent.id,
      metadata: { patientId: body.patientId, consentType: body.consentType, granted: body.granted },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: consent.id, granted: consent.granted }, 'Consent logged', 201);
  });

  // Breach Log
  app.get('/api/v1/compliance/breaches', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status, severity } = request.query as { severity?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveComplianceScope(principal);
    let q = db('breach_log').where('breach_log.tenant_id', tenantId);
    q = applyScopePolicy('compliance', q, principal, scope) as typeof q;
    if (status) q = q.andWhere('breach_log.status', status);
    if (severity) q = q.andWhere('breach_log.severity', severity);
    const breaches = await q.orderBy('detected_date', 'desc').limit(50);
    return sendSuccess(reply, breaches.map((b: BreachLogRow) => ({
      id: b.id, type: b.type, detectedDate: b.detected_date,
      reportedDate: b.reported_date, severity: b.severity,
      description: b.description, affectedData: b.affected_data,
      affectedRecords: b.affected_records, actionTaken: b.action_taken,
      status: b.status, createdAt: b.created_at, updatedAt: b.updated_at,
    })));
  });

  app.post('/api/v1/compliance/breaches', { preHandler: [authenticate, authorize('compliance.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const [breach] = await db('breach_log').insert({
      tenant_id: tenantId, type: body.type, detected_date: body.detectedDate || new Date().toISOString().split('T')[0],
      severity: body.severity || 'medium', description: body.description,
      affected_data: body.affectedData || null, affected_records: body.affectedRecords || 0,
      action_taken: body.actionTaken || null, status: body.status || 'open',
      created_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.breach_logged', entityType: 'breach_log', entityId: breach.id,
      metadata: { type: body.type, severity: body.severity },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: breach.id, type: breach.type }, 'Breach logged', 201);
  });

  app.put('/api/v1/compliance/breaches/:id', { preHandler: [authenticate, authorize('compliance.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.status) update.status = body.status;
    if (body.severity) update.severity = body.severity;
    if (body.actionTaken !== undefined) update.action_taken = body.actionTaken;
    if (body.affectedData !== undefined) update.affected_data = body.affectedData;
    if (body.affectedRecords !== undefined) update.affected_records = body.affectedRecords;
    if (body.reportedDate) update.reported_date = body.reportedDate;
    await db('breach_log').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'compliance.breach_updated', entityType: 'breach_log', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Breach updated');
  });
}
