import { getCtx, getTenantId } from "../../utils/route-helper.js";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { createInvoiceSchema, paginationSchema } from '../../utils/validation.js';
import { PatientNotFoundError, ForbiddenError } from '@healthcare/shared/errors';
import { getEnv } from '@healthcare/shared/config';
import { generateInvoiceNumber } from '@healthcare/shared/utils';
import { authenticate } from '../auth-guard.js';
import { authorize, hasPermission, assignedPatientIds, canAccessPatient, type Principal } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import type { InvoiceRow } from '../types.js';

export async function registerBillingModule(app: FastifyInstance) {
  /** Scope for invoice lists: tenant-wide, branch-wide, or assigned patients. */
  async function resolveBillingListScope(principal: Principal): Promise<{ branchIds?: string[]; patientIds?: string[] }> {
    if (hasPermission(principal, 'billing.view', 'system') || hasPermission(principal, 'billing.view', 'tenant')) return {};
    if (hasPermission(principal, 'billing.view', 'branch') || hasPermission(principal, 'billing.view', 'branches')) {
      return { branchIds: principal.branches };
    }
    if (hasPermission(principal, 'billing.view', 'assigned_patients') || hasPermission(principal, 'billing.view', 'department')) {
      return { patientIds: await assignedPatientIds(principal) };
    }
    return { patientIds: [] };
  }

  async function assertInvoiceAccess(principal: Principal, invoice: { tenant_id: string; patient_id: string; branch_id?: string | null }): Promise<void> {
    if (principal.tenantId !== invoice.tenant_id) throw new ForbiddenError('You do not have access to this invoice');
    if (hasPermission(principal, 'billing.view', 'tenant') || hasPermission(principal, 'billing.view', 'system')) return;
    if ((hasPermission(principal, 'billing.view', 'branch') || hasPermission(principal, 'billing.view', 'branches')) && invoice.branch_id) {
      if (principal.branches.includes(String(invoice.branch_id))) return;
    }
    if (hasPermission(principal, 'billing.view', 'assigned_patients') || hasPermission(principal, 'billing.view', 'department')) {
      const ids = await assignedPatientIds(principal);
      if (ids.includes(invoice.patient_id)) return;
    }
    throw new ForbiddenError('You do not have access to this invoice');
  }

  // List invoices
  app.get('/api/v1/invoices', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const query = paginationSchema.parse(request.query);
    const tenantId = getTenantId(request);
    const { status, patientId, startDate, endDate } = request.query as { endDate?: string; patientId?: string; startDate?: string; status?: string };
    const { principal } = getCtx(request);
    const scope = await resolveBillingListScope(principal);

    let queryBuilder = db('invoices')
      .join('patients', 'invoices.patient_id', 'patients.id')
      .where('invoices.tenant_id', tenantId)
      .whereNull('invoices.deleted_at');

    if (scope.branchIds && scope.branchIds.length > 0) queryBuilder = queryBuilder.whereIn('patients.branch_id', scope.branchIds);
    if (scope.branchIds && scope.branchIds.length === 0) queryBuilder = queryBuilder.where(db.raw('false'));
    if (scope.patientIds && scope.patientIds.length > 0) queryBuilder = queryBuilder.whereIn('invoices.patient_id', scope.patientIds);
    if (scope.patientIds && scope.patientIds.length === 0) queryBuilder = queryBuilder.where(db.raw('false'));
    if (status) queryBuilder = queryBuilder.andWhere('invoices.status', status);
    if (patientId) queryBuilder = queryBuilder.andWhere('invoices.patient_id', patientId);
    if (startDate) queryBuilder = queryBuilder.andWhere('invoices.issued_at', '>=', startDate);
    if (endDate) queryBuilder = queryBuilder.andWhere('invoices.issued_at', '<=', endDate);

    const total = await queryBuilder.clone().count('invoices.id as count').first();
    const invoices = await queryBuilder
      .select(
        'invoices.*',
        'patients.first_name as patient_first_name',
        'patients.last_name as patient_last_name',
        'patients.medical_record_number',
      )
      .orderBy('invoices.created_at', query.order || 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'invoice.list', entityType: 'invoice' }); } catch {}

    return sendPaginated(reply, invoices.map(mapInvoice), Number(total?.count || 0), query.page, query.limit);
  });

  // Get single invoice
  app.get('/api/v1/invoices/:invoiceId', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const tenantId = getTenantId(request);

    const invoice = await db('invoices')
      .join('patients', 'invoices.patient_id', 'patients.id')
      .where('invoices.id', invoiceId)
      .where('invoices.tenant_id', tenantId)
      .select(
        'invoices.*',
        'patients.first_name as patient_first_name',
        'patients.last_name as patient_last_name',
        'patients.medical_record_number',
        'patients.phone as patient_phone',
        'patients.email as patient_email',
        'patients.branch_id as patient_branch_id',
      )
      .first();

    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' });
    }
    await assertInvoiceAccess(getCtx(request).principal, {
      tenant_id: invoice.tenant_id,
      patient_id: invoice.patient_id,
      branch_id: invoice.patient_branch_id,
    });

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'invoice.view', entityType: 'invoice', entityId: invoiceId }); } catch {}

    return sendSuccess(reply, mapInvoice(invoice));
  });

  // Create invoice
  app.post('/api/v1/invoices', {
    preHandler: [authenticate, authorize('billing.create')],
  }, async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);
    const tenantId = getTenantId(request); const userId = getCtx(request).userId;

    const patient = await db('patients')
      .where({ id: body.patientId, tenant_id: tenantId })
      .first();
    if (!patient) throw new PatientNotFoundError(body.patientId);

    // Get tenant for invoice number
    const tenant = await db('tenants').where({ id: tenantId }).first();
    const invoiceNumber = generateInvoiceNumber(tenant?.slug || 'XX');

    const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const total = subtotal - body.discount + body.tax;

    const [invoice] = await db('invoices').insert({
      tenant_id: tenantId,
      patient_id: body.patientId,
      appointment_id: body.appointmentId || null,
      invoice_number: invoiceNumber,
      items: JSON.stringify(body.items),
      subtotal,
      discount: body.discount,
      tax: body.tax,
      total,
      paid: 0,
      due: total,
      status: 'pending',
      due_date: body.dueDate,
      issued_at: new Date().toISOString(),
      notes: body.notes || null,
      insurance_claim: body.insuranceClaim || null,
      created_by: userId,
    }).returning('*');

    try { await logAudit({ tenantId, userId, action: 'invoice.created', entityType: 'invoice', entityId: invoice.id,
      metadata: { total, patientId: body.patientId } }); } catch {}

    return sendSuccess(reply, mapInvoice(invoice), 'Invoice created', 201);
  });

  // Record payment
  app.post('/api/v1/invoices/:invoiceId/pay', {
    preHandler: [authenticate, authorize('billing.create')],
  }, async (request, reply) => {
    const { invoiceId } = request.params as { invoiceId: string };
    const tenantId = getTenantId(request);

    const body = z.object({
      amount: z.number().positive(),
      method: z.enum(['cash', 'card', 'insurance', 'bank_transfer', 'online', 'wallet']),
      notes: z.string().optional(),
    }).parse(request.body);

    const invoice = await db('invoices')
      .where({ id: invoiceId, tenant_id: tenantId })
      .first();
    if (!invoice) {
      return reply.status(404).send({ success: false, error: 'Invoice not found' });
    }
    await assertInvoiceAccess(getCtx(request).principal, invoice);

    const newPaid = Number(invoice.paid) + body.amount;
    const newDue = Number(invoice.total) - newPaid;
    let newStatus = invoice.status;

    if (newDue <= 0) {
      newStatus = 'paid';
    } else if (newPaid > 0) {
      newStatus = 'partial';
    }

    const [updated] = await db('invoices')
      .where({ id: invoiceId, tenant_id: tenantId })
      .update({
        paid: newPaid,
        due: newDue,
        status: newStatus,
        payment_method: body.method,
        paid_at: newStatus === 'paid' ? new Date().toISOString() : null,
        updated_at: new Date(),
      })
      .returning('*');

    // Record payment transaction
    await db('payment_transactions').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      amount: body.amount,
      method: body.method,
      notes: body.notes || null,
      status: 'completed',
    });

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'invoice.payment', entityType: 'invoice', entityId: invoiceId,
      metadata: { amount: body.amount, method: body.method } }); } catch {}

    return sendSuccess(reply, mapInvoice(updated), 'Payment recorded');
  });

  // Get revenue summary
  app.get('/api/v1/billing/revenue', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { startDate, endDate } = request.query as { endDate?: string; startDate?: string };

    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const end = endDate || new Date().toISOString().split('T')[0];

    const revenue = await db('invoices')
      .where('tenant_id', tenantId)
      .whereNull('deleted_at')
      .whereBetween('issued_at', [start, end])
      .select(
        db.raw('COALESCE(SUM(total), 0) as total_revenue'),
        db.raw('COALESCE(SUM(paid), 0) as total_collected'),
        db.raw('COALESCE(SUM(due), 0) as total_pending'),
        db.raw('COUNT(*) as invoice_count'),
        db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as paid_count', ['paid']),
        db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as pending_count', ['pending']),
        db.raw('COUNT(CASE WHEN status = ? THEN 1 END) as overdue_count', ['overdue']),
      )
      .first();

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'billing.revenue_summary', entityType: 'invoice' }); } catch {}

    return sendSuccess(reply, {
      period: { start, end },
      ...revenue,
    });
  });

  // Get patient invoices
  app.get('/api/v1/patients/:patientId/invoices', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    const tenantId = getTenantId(request);
    const query = paginationSchema.parse(request.query);

    const invoices = await db('invoices')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .orderBy('created_at', query.order || 'desc')
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const total = await db('invoices')
      .where({ patient_id: patientId, tenant_id: tenantId })
      .whereNull('deleted_at')
      .count('id as count')
      .first();

    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'invoice.patient_list', entityType: 'invoice', entityId: patientId }); } catch {}

    return sendPaginated(reply, invoices.map(mapInvoice), Number(total?.count || 0), query.page, query.limit);
  });
  // Create Stripe checkout session
  app.post('/api/v1/payments/stripe/create', {
    preHandler: [authenticate, authorize('billing.create')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { invoiceId, amount, currency } = z.object({
      invoiceId: z.string().uuid(), amount: z.number().positive(), currency: z.string().default('sar'),
    }).parse(request.body);

    const { createStripePayment } = await import('../../services/payment.js');
    const result = await createStripePayment(invoiceId, amount, currency.toUpperCase(), tenantId);
    if (!result.success) return reply.code(400).send({ error: result.error });
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'payment.stripe_created', entityType: 'invoice', entityId: invoiceId,
      metadata: { amount, currency } }); } catch {}
    return sendSuccess(reply, result);
  });

  // Get payment link
  app.get('/api/v1/payments/link/:tenantSlug/:invoiceId', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const { invoiceId, tenantSlug } = request.params as { invoiceId: string; tenantSlug: string };
    const { generatePaymentLink } = await import('../../services/payment.js');
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId: tenantSlug, userId, action: 'payment.link_generated', entityType: 'invoice', entityId: invoiceId }); } catch {}
    return sendSuccess(reply, { url: generatePaymentLink(invoiceId, tenantSlug) });
  });

  // Revenue by month
  app.get('/api/v1/billing/revenue/monthly', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const year = parseInt(String((request.query as Record<string, unknown>)["year"])) || new Date().getFullYear();
    const monthly = await db('invoices').where('tenant_id', tenantId).whereNull('deleted_at')
      .whereRaw('EXTRACT(YEAR FROM issued_at) = ?', [year])
      .select(db.raw("TO_CHAR(issued_at, 'Mon') as month"), db.raw('EXTRACT(MONTH FROM issued_at) as m'), db.raw('COALESCE(SUM(total),0) as revenue'), db.raw('COALESCE(SUM(paid),0) as collected'))
      .groupByRaw('month, m').orderBy('m');
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'billing.revenue_monthly', entityType: 'invoice' }); } catch {}
    return sendSuccess(reply, monthly);
  });

  // Aging report
  app.get('/api/v1/billing/reports/aging', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const [current] = await db('invoices').where('tenant_id', tenantId).whereNull('deleted_at').where('due', '>', 0).whereRaw("issued_at >= NOW() - INTERVAL '30 days'").select(db.raw('COALESCE(SUM(due),0) as amount'));
    const [thirty] = await db('invoices').where('tenant_id', tenantId).whereNull('deleted_at').where('due', '>', 0).whereRaw("issued_at >= NOW() - INTERVAL '60 days'").whereRaw("issued_at < NOW() - INTERVAL '30 days'").select(db.raw('COALESCE(SUM(due),0) as amount'));
    const [sixty] = await db('invoices').where('tenant_id', tenantId).whereNull('deleted_at').where('due', '>', 0).whereRaw("issued_at >= NOW() - INTERVAL '90 days'").whereRaw("issued_at < NOW() - INTERVAL '60 days'").select(db.raw('COALESCE(SUM(due),0) as amount'));
    const [overdue] = await db('invoices').where('tenant_id', tenantId).whereNull('deleted_at').where('due', '>', 0).whereRaw("issued_at < NOW() - INTERVAL '90 days'").select(db.raw('COALESCE(SUM(due),0) as amount'));
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'billing.aging_report', entityType: 'invoice' }); } catch {}
    return sendSuccess(reply, { current: Number(current.amount), thirty: Number(thirty.amount), sixty: Number(sixty.amount), overdue: Number(overdue.amount) });
  });

  // Top patients by revenue
  app.get('/api/v1/billing/reports/top-patients', {
    preHandler: [authenticate, authorize('billing.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const patients = await db('invoices').join('patients', 'invoices.patient_id', 'patients.id')
      .where('invoices.tenant_id', tenantId).whereNull('invoices.deleted_at')
      .select(db.raw("patients.first_name || ' ' || patients.last_name as name"), db.raw('COALESCE(SUM(invoices.total),0) as total'))
      .groupBy('patients.id', 'patients.first_name', 'patients.last_name')
      .orderBy('total', 'desc').limit(10);
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'billing.top_patients', entityType: 'invoice' }); } catch {}
    return sendSuccess(reply, patients);
  });
}

function mapInvoice(i: InvoiceRow) {
  return {
    id: i.id,
    tenantId: i.tenant_id,
    patientId: i.patient_id,
    appointmentId: i.appointment_id,
    invoiceNumber: i.invoice_number,
    items: i.items ? (typeof i.items === 'string' ? JSON.parse(i.items) : i.items) : [],
    subtotal: Number(i.subtotal),
    discount: Number(i.discount),
    tax: Number(i.tax),
    total: Number(i.total),
    paid: Number(i.paid),
    due: Number(i.due),
    status: i.status,
    paymentMethod: i.payment_method,
    insuranceClaim: i.insurance_claim,
    notes: i.notes,
    dueDate: i.due_date,
    issuedAt: i.issued_at,
    paidAt: i.paid_at,
    patientName: i.patient_first_name && i.patient_last_name ? `${i.patient_first_name} ${i.patient_last_name}` : undefined,
    patientMrn: i.medical_record_number,
    patientPhone: (i as unknown as Record<string, unknown>).patient_phone,
    patientEmail: (i as unknown as Record<string, unknown>).patient_email,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}
