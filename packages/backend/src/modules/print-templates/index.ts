import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { sanitizeTemplateHtml } from '../../utils/html-sanitizer.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { formatDocumentDate, formatDocumentMoney, loadClinicDocumentContext } from '../../services/pdf.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

async function clinicPrintVariables(tenantId: string, data: Record<string, unknown>): Promise<Record<string, string>> {
  const clinic = await loadClinicDocumentContext(tenantId, {
    branchId: typeof data.branch_id === 'string' ? data.branch_id : undefined,
  });
  const amount = (value: unknown) => formatDocumentMoney(value as number | string | null | undefined, clinic.currency, clinic.locale);
  return {
    clinic_name: clinic.displayName,
    clinic_legal_name: clinic.legalName,
    clinic_license_number: clinic.licenseNumber,
    clinic_tax_number: clinic.taxNumber,
    clinic_currency: clinic.currency,
    clinic_timezone: clinic.timezone,
    clinic_locale: clinic.locale,
    clinic_address: clinic.address,
    clinic_phone: clinic.phone,
    clinic_email: clinic.email,
    clinic_working_hours: clinic.workingHours,
    document_number: String(data.reference || data.invoice_number || data.prescription_number || data.order_number || data.id || ''),
    document_date: data.created_at ? formatDocumentDate(String(data.created_at), clinic.timezone, clinic.locale) : '',
    invoice_number: String(data.invoice_number || ''),
    invoice_subtotal: amount(data.subtotal),
    invoice_discount: amount(data.discount),
    invoice_tax: amount(data.tax),
    invoice_total: amount(data.total ?? data.invoice_total),
    invoice_paid: amount(data.paid),
    invoice_due: amount(data.due),
    receipt_number: String(data.reference || data.id || ''),
    receipt_amount: amount(data.amount),
    receipt_method: String(data.method || ''),
    receipt_status: String(data.status || ''),
    receipt_notes: String(data.notes || ''),
  };
}

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

  app.post('/api/v1/print/templates', { preHandler: [authenticate, authorize('settings.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const code = String(body.code || '').trim();
    const existing = await db('print_templates').where({ tenant_id: tenantId, code }).first();
    if (existing) return reply.code(409).send({ success: false, error: 'A template with this code already exists' });

    const defaultHtml = '<h1>{{title}}</h1><p>This is a default template. Edit it to customize the layout.</p>';
    const [t] = await db('print_templates').insert({
      tenant_id: tenantId, name: body.name, code,
      category: body.category || 'clinical', document_type: body.documentType,
      content_html: body.contentHtml ? sanitizeTemplateHtml(String(body.contentHtml)) : defaultHtml,
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
    if (documentType === 'invoice') {
      data = await db('invoices')
        .leftJoin('appointments as print_invoice_appointments', 'invoices.appointment_id', 'print_invoice_appointments.id')
        .where({ 'invoices.id': referenceId, 'invoices.tenant_id': tenantId })
        .select('invoices.*', 'print_invoice_appointments.branch_id as branch_id')
        .first() || {};
    } else if (documentType === 'prescription') {
      data = await db('pharmacy_prescriptions')
        .leftJoin('emr_records as print_rx_emr', 'pharmacy_prescriptions.emr_record_id', 'print_rx_emr.id')
        .leftJoin('appointments as print_rx_appointments', 'print_rx_emr.appointment_id', 'print_rx_appointments.id')
        .where({ 'pharmacy_prescriptions.id': referenceId, 'pharmacy_prescriptions.tenant_id': tenantId })
        .select('pharmacy_prescriptions.*', 'print_rx_appointments.branch_id as branch_id')
        .first() || {};
    } else if (documentType === 'lab_report') {
      data = await db('lab_orders')
        .leftJoin('appointments as print_lab_appointments', 'lab_orders.appointment_id', 'print_lab_appointments.id')
        .where({ 'lab_orders.id': referenceId, 'lab_orders.tenant_id': tenantId })
        .select('lab_orders.*', 'print_lab_appointments.branch_id as branch_id')
        .first() || {};
    }
    else if (documentType === 'receipt') {
      data = await db('payment_transactions as payments')
        .leftJoin('invoices', 'payments.invoice_id', 'invoices.id')
        .leftJoin('appointments as print_receipt_appointments', 'invoices.appointment_id', 'print_receipt_appointments.id')
        .where('payments.id', referenceId)
        .andWhere('payments.tenant_id', tenantId)
        .select(
          'payments.*',
          'invoices.invoice_number',
          'print_receipt_appointments.branch_id as invoice_branch_id',
          'invoices.subtotal as invoice_subtotal',
          'invoices.total as invoice_total',
          'invoices.paid as invoice_paid',
          'invoices.due as invoice_due',
        )
        .first() || {};
      if (data.invoice_branch_id && !data.branch_id) data.branch_id = data.invoice_branch_id;
    } else if (documentType === 'patient_summary') data = await db('patients').where({ id: referenceId, tenant_id: tenantId }).first() || {};

    // Replace declared variables and built-in clinic/billing variables.
    let html = template.content_html || '';
    const declaredVariables = Array.isArray(template.variables)
      ? template.variables
      : (typeof template.variables === 'string' ? JSON.parse(template.variables) : []);
    const builtInVariables = await clinicPrintVariables(tenantId, data);
    const values: Record<string, unknown> = { ...data, ...builtInVariables };
    const variableNames = new Set<string>([
      ...declaredVariables.filter((value: unknown): value is string => typeof value === 'string'),
      ...Object.keys(builtInVariables),
    ]);
    for (const variable of variableNames) {
      const value = values[variable];
      if (value === undefined || value === null) continue;
      html = html.replace(new RegExp(escapeRegExp(`{{${variable}}}`), 'g'), String(value));
    }

    return reply.type('text/html').send(sanitizeTemplateHtml(html));
  });
}
