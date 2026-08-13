import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { sanitizeTemplateHtml } from '../../utils/html-sanitizer.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerPrintTemplatesModule(app: FastifyInstance) {
  app.get('/api/v1/print/templates', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { documentType } = request.query as { documentType?: string };
    let q = db('print_templates').where({ tenant_id: tenantId });
    if (documentType) q = q.andWhere('document_type', documentType);
    const templates = await q.orderBy('name');
    return sendSuccess(reply, templates.map((t: Record<string, unknown>) => ({
      id: t.id, name: t.name, code: t.code, category: t.category,
      documentType: t.document_type, variables: t.variables,
      paperSize: t.paper_size, isDefault: t.is_default, isActive: t.is_active
    })));
  });

  app.get('/api/v1/print/templates/:code', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { code } = request.params as { code: string };
    const t = await db('print_templates').where({ tenant_id: tenantId, code }).first();
    if (!t) return reply.status(404).send({ success: false, error: 'Template not found' });
    return sendSuccess(reply, {
      id: t.id, name: t.name, code: t.code, category: t.category,
      documentType: t.document_type, contentHtml: t.content_html,
      variables: t.variables, styles: t.styles,
      paperSize: t.paper_size, isDefault: t.is_default
    });
  });

  app.post('/api/v1/print/templates', { preHandler: [authenticate, authorize('settings.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const [t] = await db('print_templates').insert({
      tenant_id: tenantId, name: body.name, code: body.code,
      category: body.category || 'clinical', document_type: body.documentType,
      content_html: body.contentHtml ? sanitizeTemplateHtml(String(body.contentHtml)) : null,
      variables: JSON.stringify(body.variables || []),
      styles: JSON.stringify(body.styles || {}), paper_size: body.paperSize || 'A4',
      is_default: body.isDefault || false
    }).returning('*');
    return sendSuccess(reply, { id: t.id, code: t.code, name: t.name }, 'Template created', 201);
  });

  app.put('/api/v1/print/templates/:id', { preHandler: [authenticate, authorize('settings.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { id } = request.params as { id: string }; const body = request.body as Record<string, unknown>;
    const existing = await findTenantRow('print_templates', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Template not found' });
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name) update.name = body.name; if (body.contentHtml) update.content_html = sanitizeTemplateHtml(String(body.contentHtml));
    if (body.variables) update.variables = JSON.stringify(body.variables);
    if (body.styles) update.styles = JSON.stringify(body.styles);
    if (body.isDefault !== undefined) update.is_default = body.isDefault;
    await db('print_templates').where({ id, tenant_id: tenantId }).update(update);
    return sendSuccess(reply, null, 'Template updated');
  });

  // Render a document (returns HTML for printing)
  app.get('/api/v1/print/render/:documentType/:referenceId', { preHandler: [authenticate, authorize('documents.print')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { documentType, referenceId } = request.params as { documentType: string; referenceId: string };
    const template = await db('print_templates').where({ tenant_id: tenantId, document_type: documentType, is_default: true }).first();
    if (!template) return reply.status(404).send({ success: false, error: 'No default template for this document type' });

    // Fetch reference data based on type
    let data: Record<string, unknown> = {};
    if (documentType === 'invoice') data = await db('invoices').where({ id: referenceId, tenant_id: tenantId }).first() || {};
    else if (documentType === 'prescription') data = await db('pharmacy_prescriptions').where({ id: referenceId, tenant_id: tenantId }).first() || {};
    else if (documentType === 'lab_report') data = await db('lab_orders').where({ id: referenceId, tenant_id: tenantId }).first() || {};
    else if (documentType === 'patient_summary') data = await db('patients').where({ id: referenceId, tenant_id: tenantId }).first() || {};

    // Replace variables in template
    let html = template.content_html || '';
    const vars = template.variables || [];
    for (const v of vars) {
      const val = data[v] || `{{${v}}}`;
      html = html.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), String(val));
    }

    return reply.type('text/html').send(sanitizeTemplateHtml(html));
  });
}
