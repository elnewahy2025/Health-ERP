import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import type { CrmCampaignRow, PaginationQuery } from "../types.js";

export async function registerCrmModule(app: FastifyInstance) {
  app.get('/api/v1/crm/campaigns', { preHandler: [authenticate, authorize('crm.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status } = request.query as PaginationQuery & { status?: string };
    let q = db('crm_campaigns').where('crm_campaigns.tenant_id', tenantId).whereNull('crm_campaigns.deleted_at');
    if (status) q = q.andWhere('crm_campaigns.status', status);
    const rows = await q.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, rows.map((c: Record<string, unknown>) => ({ id: c.id, name: c.name, type: c.type, status: c.status, description: c.description, startDate: c.start_date, endDate: c.end_date, budget: Number(c.budget), targetCount: c.target_count, reachedCount: c.reached_count, conversionCount: c.conversion_count })));
  });

  app.post('/api/v1/crm/campaigns', { preHandler: [authenticate, authorize('crm.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const [camp] = await db('crm_campaigns').insert({ tenant_id: tenantId, name: body.name, type: body.type || 'email', description: body.description, start_date: body.startDate, end_date: body.endDate, budget: body.budget || 0, target_count: body.targetCount || 0, created_by: ctx.userId }).returning('*');
    return sendSuccess(reply, { id: camp.id, name: camp.name }, 'Campaign created', 201);
  });

  app.get('/api/v1/crm/feedback', { preHandler: [authenticate, authorize('crm.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const rows = await db('crm_patient_feedback').where('crm_patient_feedback.tenant_id', tenantId)
      .join('patients', 'crm_patient_feedback.patient_id', 'patients.id')
      .select('crm_patient_feedback.*', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('created_at', 'desc').limit(50);
    const avg = await db('crm_patient_feedback').where({ tenant_id: tenantId }).avg('rating as avg').first();
    return sendSuccess(reply, { averageRating: Number((avg as Record<string, unknown>)?.avg || 0).toFixed(1), total: rows.length, feedback: rows.map((f: Record<string, unknown>) => ({ id: f.id, patientId: f.patient_id, patientName: f.pf + ' ' + f.pl, rating: f.rating, comment: f.comment, category: f.category, createdAt: f.created_at })) });
  });
}
