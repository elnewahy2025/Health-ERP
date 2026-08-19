import crypto from "crypto";
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';
import { logAudit } from '../../services/audit.js';
import { loadClinicDocumentContext } from '../../services/pdf.js';
import { getEnv } from '@healthcare/shared/config';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { providerRuntimeOrFallback } from '../../services/clinic-provider-runtime.js';
import { assertClinicProviderOperation } from '../../services/clinic-provider-capabilities.js';

export async function registerFinancialDeepeningModule(app: FastifyInstance) {
  const env = getEnv();
  const resolveExpenseScope = (principal: { grants: Array<{ permission: string; scope: PermissionScope }> }, permission = 'expenses.view'): PermissionScope =>
    principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'tenant';

  // ==================== EXPENSE CATEGORIES ====================

  app.get('/api/v1/expense-categories', { preHandler: [authenticate, authorize('expenses.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const categories = await db('expense_categories')
      .where(function () { this.whereNull('tenant_id').orWhere('tenant_id', tenantId); })
      .andWhere({ is_active: true })
      .orderBy('name');
    const { userId } = getCtx(request);
    try { await logAudit({ tenantId, userId, action: 'expense_category.list', entityType: 'expense_category' }); } catch {}
    return sendSuccess(reply, categories);
  });

  app.post('/api/v1/expense-categories', { preHandler: [authenticate, authorize('expenses.create')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const body = z.object({
      name: z.string().min(1), code: z.string().min(1).max(50),
      type: z.string().optional().default('operational'), description: z.string().optional(),
    }).parse(request.body);

    const [cat] = await db('expense_categories').insert({
      tenant_id: tenantId, name: body.name, code: body.code,
      type: body.type, description: body.description || null,
    }).returning('*');
    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'expense_category.create', entityType: 'expense_category', entityId: cat.id }); } catch {}
    return sendSuccess(reply, cat, 'Category created', 201);
  });

  // ==================== EXPENSES ====================

  app.get('/api/v1/expenses', { preHandler: [authenticate, authorize('expenses.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      status: z.string().optional(), categoryId: z.string().optional(),
      fromDate: z.string().optional(), toDate: z.string().optional(),
    }).parse(request.query);

    const principal = getCtx(request).principal;
    const scope = resolveExpenseScope(principal, 'expenses.view');
    let dbQuery = db('expenses').leftJoin('expense_categories', 'expenses.category_id', 'expense_categories.id')
      .where('expenses.tenant_id', tenantId);
    dbQuery = applyScopePolicy('expenses', dbQuery, principal, scope) as typeof dbQuery;

    if (query.status) dbQuery = dbQuery.andWhere('expenses.status', query.status);
    if (query.categoryId) dbQuery = dbQuery.andWhere('expenses.category_id', query.categoryId);
    if (query.fromDate) dbQuery = dbQuery.andWhere('expenses.expense_date', '>=', query.fromDate);
    if (query.toDate) dbQuery = dbQuery.andWhere('expenses.expense_date', '<=', query.toDate);

    const total = await dbQuery.clone().count('expenses.id as count').first();
    const data = await dbQuery.clone()
      .select('expenses.*', 'expense_categories.name as category_name', 'expense_categories.code as category_code')
      .orderBy('expenses.expense_date', 'desc')
      .limit(query.limit).offset((query.page - 1) * query.limit);

    const { userId: listUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: listUserId, action: 'expense.list', entityType: 'expense' }); } catch {}
    return sendPaginated(reply, data, Number(total?.count || 0), query.page, query.limit);
  });

  app.post('/api/v1/expenses', { preHandler: [authenticate, authorize('expenses.create')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const principal = getCtx(request).principal;
    const expenseScope = resolveExpenseScope(principal, 'expenses.create');
    const body = z.object({
      title: z.string().min(1), amount: z.number().positive(),
      categoryId: z.string().uuid().optional().nullable(),
      branchId: z.string().uuid().optional().nullable(),
      expenseDate: z.string().optional(),
      description: z.string().optional(),
      paymentMethod: z.string().optional().default('cash'),
      vendorName: z.string().optional(),
      vendorTaxId: z.string().optional(),
      taxType: z.string().optional(),
      taxAmount: z.number().optional().default(0),
    }).parse(request.body);

    if (expenseScope === 'branch' && (!body.branchId || !principal.branches.includes(body.branchId))) {
      throw new ForbiddenError('Expense creation is limited to assigned branches');
    }

    // Generate expense number
    const count = await db('expenses').where({ tenant_id: tenantId }).count('id as count').first();
    const expenseNumber = `EXP-${String(Number(count?.count || 0) + 1).padStart(5, '0')}`;

    const [expense] = await db('expenses').insert({
      tenant_id: tenantId, title: body.title, amount: body.amount,
      category_id: body.categoryId || null, branch_id: expenseScope === 'branch' ? body.branchId : (body.branchId || null),
      expense_date: body.expenseDate || new Date().toISOString().split('T')[0],
      description: body.description || null, payment_method: body.paymentMethod,
      vendor_name: body.vendorName || null, vendor_tax_id: body.vendorTaxId || null,
      tax_type: body.taxType || null, tax_amount: body.taxAmount || 0,
      created_by: userId, expense_number: expenseNumber,
    }).returning('*');

    await logAudit({ tenantId, userId, action: 'expense.create', entityType: 'expense', entityId: expense.id });
    return sendSuccess(reply, expense, 'Expense created', 201);
  });

  app.put('/api/v1/expenses/:id', { preHandler: [authenticate, authorize('expenses.edit')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      title: z.string().optional(), amount: z.number().positive().optional(),
      categoryId: z.string().uuid().optional().nullable(),
      description: z.string().optional(), status: z.string().optional(),
      paymentMethod: z.string().optional(), vendorName: z.string().optional(),
    }).parse(request.body);

    const principal = getCtx(request).principal;
    const scope = resolveExpenseScope(principal, 'expenses.edit');
    const existing = await applyScopePolicy('expenses', db('expenses').where({ id, tenant_id: tenantId }), principal, scope).first();
    if (!existing) return sendError(reply, 'Expense not found', 404);

    const updates: Record<string, unknown> = {};
    if (body.title) updates.title = body.title;
    if (body.amount) updates.amount = body.amount;
    if (body.categoryId !== undefined) updates.category_id = body.categoryId;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status) updates.status = body.status;
    if (body.paymentMethod) updates.payment_method = body.paymentMethod;
    if (body.vendorName !== undefined) updates.vendor_name = body.vendorName;

    if (body.status === 'approved' && existing.status !== 'approved') {
      updates.approved_by = userId;
      updates.approved_at = db.fn.now();
    }
    if (body.status === 'paid') updates.paid_at = db.fn.now();

    await db('expenses').where({ id, tenant_id: tenantId }).update(updates);
    await logAudit({ tenantId, userId, action: 'expense.update', entityType: 'expense', entityId: id });
    return sendSuccess(reply, { id }, 'Expense updated');
  });

  app.get('/api/v1/expenses/stats', { preHandler: [authenticate, authorize('expenses.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({ fromDate: z.string().optional(), toDate: z.string().optional() }).parse(request.query);

    const principal = getCtx(request).principal;
    const scope = resolveExpenseScope(principal, 'expenses.view');
    let baseQuery = db('expenses').where({ tenant_id: tenantId, status: 'paid' });
    baseQuery = applyScopePolicy('expenses', baseQuery, principal, scope) as typeof baseQuery;
    if (query.fromDate) baseQuery = baseQuery.andWhere('expense_date', '>=', query.fromDate);
    if (query.toDate) baseQuery = baseQuery.andWhere('expense_date', '<=', query.toDate);

    const totalExpenses = await baseQuery.clone().sum('amount as total').first();
    const byCategory = await baseQuery.clone().select('category_id').sum('amount as total').groupBy('category_id');
    const byMonth = await baseQuery.clone()
      .select(db.raw("to_char(expense_date, 'YYYY-MM') as month"))
      .sum('amount as total').groupByRaw("to_char(expense_date, 'YYYY-MM')").orderByRaw('month');
    const pendingQuery = applyScopePolicy('expenses', db('expenses').where({ tenant_id: tenantId, status: 'pending' }), principal, scope);
    const pendingCount = await pendingQuery.count('id as count').first();

    return sendSuccess(reply, {
      totalExpenses: Number((totalExpenses as Record<string, unknown>)?.total || 0),
      pendingCount: Number(pendingCount?.count || 0),
      byCategory, byMonth,
    });
  });

  // ==================== ETA E-INVOICING ====================

  app.post('/api/v1/eta/invoices/generate', { preHandler: [authenticate, authorize('eta_invoicing.create')] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      invoiceId: z.string().uuid(),
      documentType: z.string().optional().default('I'),
    }).parse(request.body);

    const invoice = await db('invoices')
      .join('patients', 'invoices.patient_id', 'patients.id')
      .where('invoices.id', body.invoiceId)
      .where('invoices.tenant_id', tenantId)
      .select('invoices.*', 'patients.first_name', 'patients.last_name', 'patients.national_id')
      .first();

    if (!invoice) return sendError(reply, 'Invoice not found', 404);

    const tenant = await db('tenants').where({ id: tenantId }).first();
    if (!tenant?.tax_registration_number) return sendError(reply, 'Tenant tax registration not configured', 400);

    // Generate ETA-compliant JSON
    const etaJson = {
      documentType: body.documentType,
      transactionType: 'S',
      dateTimeIssued: new Date(invoice.created_at).toISOString(),
      taxpayerActivityCode: '8610', // Hospital activities
      internalID: invoice.invoice_number,
      purchaseOrderReference: null,
      salesOrderReference: null,
      payment: {
        bankName: null,
        bankAccountNumber: null,
        term: 30,
      },
      invoiceLines: [{
        description: 'Medical Services - Invoice ' + invoice.invoice_number,
        itemType: 'GS1',
        itemCode: '10000001',
        unitType: 'EA',
        quantity: 1,
        internalCode: null,
        salesTotal: Number(invoice.total),
        total: Number(invoice.total),
        valueDifference: 0,
        totalTaxableFees: 0,
        netTotal: Number(invoice.total),
        itemsDiscount: 0,
        discount: {
          rate: Number(invoice.discount || 0) / Number(invoice.total) * 100 || 0,
          amount: Number(invoice.discount || 0),
        },
        taxableItems: [{
          taxType: 'T1', // Value Added Tax
          amount: Number(invoice.tax || 0),
          subType: 'S',
          rate: 14, // Egypt VAT
        }],
      }],
      totalDiscountAmount: Number(invoice.discount || 0),
      totalSalesAmount: Number(invoice.total),
      netAmount: Number(invoice.total) - Number(invoice.discount || 0),
      taxTotalAmount: Number(invoice.tax || 0),
      totalAmount: Number(invoice.total) + Number(invoice.tax || 0) - Number(invoice.discount || 0),
      currency: 'EGP',
      extraDiscountAmount: 0,
      totalItemsDiscountAmount: 0,
      signatures: [],
    };

    // Generate QR code data (TLV format)
    const qrData = generateEtaQrTLV(
      tenant.name || 'Healthcare Facility',
      tenant.tax_registration_number,
      new Date(invoice.created_at).toISOString(),
      Number(etaJson.totalAmount),
      Number(invoice.tax || 0),
    );

    const [etaInvoice] = await db('eta_invoices').insert({
      tenant_id: tenantId,
      invoice_id: body.invoiceId,
      document_type: body.documentType,
      transaction_type: 'S',
      status: 'draft',
      eta_json: JSON.stringify(etaJson),
      qr_code_data: qrData,
    }).returning('*');

    return sendSuccess(reply, etaInvoice, 'ETA invoice generated', 201);
  });

  app.post('/api/v1/eta/invoices/:id/submit', { preHandler: [authenticate, authorize('eta_invoicing.manage')] }, async (request, reply) => {
    assertClinicProviderOperation('eta', 'eta.invoice.submit');
    return sendError(reply, 'ETA invoice submission is not available until the verified ETA provider contract is configured.', 409);
  });

  app.get('/api/v1/eta/invoices', { preHandler: [authenticate, authorize('eta_invoicing.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1), limit: z.coerce.number().optional().default(20),
      status: z.string().optional(),
    }).parse(request.query);

    let dbQuery = db('eta_invoices').where({ tenant_id: tenantId });
    if (query.status) dbQuery = dbQuery.andWhere({ status: query.status });

    const total = await dbQuery.clone().count('id as count').first();
    const data = await dbQuery.clone().orderBy('created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);
    return sendPaginated(reply, data, Number(total?.count || 0), query.page, query.limit);
  });

  // ==================== P&L AND FINANCIAL REPORTS ====================

  app.get('/api/v1/financial/pl-report', { preHandler: [authenticate, authorize('financial_reports.view')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      fromDate: z.string().optional().default(() => new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]),
      toDate: z.string().optional().default(() => new Date().toISOString().split('T')[0]),
    }).parse(request.query);

    // Total revenue (paid invoices)
    const revenue = await db('invoices')
      .where({ tenant_id: tenantId })
      .whereBetween('created_at', [query.fromDate, query.toDate + 'T23:59:59'])
      .sum('total as total').where('status', '!=', 'cancelled').first();

    const paidRevenue = await db('payment_transactions')
      .join('invoices', 'payment_transactions.invoice_id', 'invoices.id')
      .where('payment_transactions.tenant_id', tenantId)
      .where('payment_transactions.status', 'completed')
      .whereBetween('payment_transactions.created_at', [query.fromDate, query.toDate + 'T23:59:59'])
      .sum('payment_transactions.amount as total').first();

    // Total expenses
    const totalExpenses = await db('expenses')
      .where({ tenant_id: tenantId, status: 'paid' })
      .whereBetween('expense_date', [query.fromDate, query.toDate])
      .sum('amount as total').first();

    // Expenses by category
    const expensesByCategory = await db('expenses')
      .join('expense_categories', 'expenses.category_id', 'expense_categories.id')
      .where('expenses.tenant_id', tenantId)
      .where('expenses.status', 'paid')
      .whereBetween('expenses.expense_date', [query.fromDate, query.toDate])
      .select('expense_categories.name as category', 'expense_categories.type')
      .sum('expenses.amount as total')
      .groupBy('expense_categories.name', 'expense_categories.type')
      .orderByRaw('total desc');

    // Revenue by month
    const revenueByMonth = await db('invoices')
      .where({ tenant_id: tenantId })
      .where('status', '!=', 'cancelled')
      .whereBetween('created_at', [query.fromDate, query.toDate + 'T23:59:59'])
      .select(db.raw("to_char(created_at, 'YYYY-MM') as month"))
      .sum('total as revenue')
      .sum('paid as collected')
      .groupByRaw("to_char(created_at, 'YYYY-MM')")
      .orderByRaw('month');

    // Expense by month
    const expenseByMonth = await db('expenses')
      .where({ tenant_id: tenantId, status: 'paid' })
      .whereBetween('expense_date', [query.fromDate, query.toDate])
      .select(db.raw("to_char(expense_date, 'YYYY-MM') as month"))
      .sum('amount as total')
      .groupByRaw("to_char(expense_date, 'YYYY-MM')")
      .orderByRaw('month');

    const totalRevenue = Number(revenue?.total || 0);
    const totalPaid = Number(paidRevenue?.total || 0);
    const totalExp = Number(totalExpenses?.total || 0);

    const { userId: plUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: plUserId, action: 'financial.pl_report', entityType: 'financial_report' }); } catch {}
    return sendSuccess(reply, {
      period: { from: query.fromDate, to: query.toDate },
      revenue: {
        total: totalRevenue,
        collected: totalPaid,
        outstanding: totalRevenue - totalPaid,
      },
      expenses: {
        total: totalExp,
        byCategory: expensesByCategory,
        byMonth: expenseByMonth,
      },
      grossProfit: totalRevenue - totalExp,
      profitMargin: totalRevenue > 0 ? ((totalRevenue - totalExp) / totalRevenue * 100) : 0,
      revenueByMonth,
      expenseByMonth,
    });
  });

  // ==================== BUDGET MANAGEMENT ====================

  app.get('/api/v1/budget-plans', { preHandler: [authenticate, authorize('expenses.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const data = await db('budget_plans').where({ tenant_id: tenantId }).orderBy('start_date', 'desc');
    const { userId: budgetUserId } = getCtx(request);
    try { await logAudit({ tenantId, userId: budgetUserId, action: 'budget.list', entityType: 'budget_plan' }); } catch {}
    return sendSuccess(reply, data);
  });

  app.post('/api/v1/budget-plans', { preHandler: [authenticate, authorize('expenses.manage')] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const body = z.object({
      name: z.string().min(1), period: z.string(),
      startDate: z.string(), endDate: z.string(),
      projectedRevenue: z.number().optional().default(0),
      projectedExpenses: z.number().optional().default(0),
    }).parse(request.body);

    const [plan] = await db('budget_plans').insert({
      tenant_id: tenantId, name: body.name, period: body.period,
      start_date: body.startDate, end_date: body.endDate,
      projected_revenue: body.projectedRevenue,
      projected_expenses: body.projectedExpenses,
    }).returning('*');
    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'budget.create', entityType: 'budget_plan', entityId: plan.id }); } catch {}
    return sendSuccess(reply, plan, 'Budget plan created', 201);
  });

  // ==================== ENHANCED PAYMENT ROUTES (Fawry/InstaPay) ====================

  app.post('/api/v1/payments/fawry/callback', async (request, reply) => {
    assertClinicProviderOperation('fawry', 'fawry.payment.callback.verify');
    const body = request.body as Record<string, unknown>;
    const fawryRef = body.fawryRef || body.referenceNumber || body.merchantRefNumber;
    const storedPayment = fawryRef
      ? await db('payment_transactions').where({ reference: String(fawryRef) }).select('tenant_id').first() as { tenant_id?: string } | undefined
      : undefined;
    const fawryRuntime = await providerRuntimeOrFallback(storedPayment?.tenant_id, 'fawry', {
      secrets: { secureKey: env.FAWRY_SECURITY_KEY || '' },
    });
    // Verify Fawry signature presence using the tenant's configured secret when available.
    const fawrySecurityKey = fawryRuntime?.secrets.secureKey || fawryRuntime?.secrets.hashKey;
    const receivedSignature = (request.headers['x-fawry-signature'] as string) || (body as Record<string, unknown>).signature;
    if (fawrySecurityKey && !receivedSignature) {
      return reply.status(401).send({ error: 'Missing signature' });
    }
    const status = body.status || body.paymentStatus;

    if (fawryRef && status === 'PAID') {
      await db('payment_transactions')
        .where({ provider_key: 'fawry', reference: String(fawryRef) })
        .update({ status: 'completed' });
    }
    return reply.status(200).send({ status: 'OK' });
  });

  app.post('/api/v1/payments/instapay/callback', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const instapayRef = body.reference || body.transactionId;
    if (instapayRef) {
      await db('payment_transactions')
        .where({ instapay_reference: instapayRef })
        .update({ status: 'completed' });
    }
    return reply.status(200).send({ status: 'OK' });
  });


  // ==================== FAWRY CREATE ====================

  app.post('/api/v1/payments/fawry/create', {
    preHandler: [authenticate, authorize('billing.create')],
  }, async (request, reply) => {
    assertClinicProviderOperation('fawry', 'fawry.payment.create');
    const tenantId = getTenantId(request);
    const { userId } = getCtx(request);
    const { invoiceId, amount, customerPhone, customerName, customerEmail } = z.object({
      invoiceId: z.string().uuid(),
      amount: z.number().positive(),
      customerPhone: z.string().min(10),
      customerName: z.string().min(1),
      customerEmail: z.string().email().optional(),
    }).parse(request.body);

    const invoice = await db('invoices').where({ id: invoiceId, tenant_id: tenantId }).first();
    if (!invoice) return sendError(reply, 'Invoice not found', 404);

    const runtime = await providerRuntimeOrFallback(tenantId, 'fawry', {
      config: { merchantCode: env.FAWRY_MERCHANT_CODE || '' },
      secrets: { secureKey: env.FAWRY_SECURITY_KEY || '' },
    });
    if (runtime?.status === 'disabled') return sendError(reply, 'Fawry is disabled for this clinic.', 409);
    const merchantCode = String(runtime?.config.merchantCode || '');
    if (!merchantCode) return sendError(reply, 'Fawry is not ready for this clinic. Complete the provider setup in Settings > Integrations.', 409);
    const referenceNumber = `FW-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const [paymentTx] = await db('payment_transactions').insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      amount,
      method: 'fawry',
      provider_key: 'fawry',
      reference: referenceNumber,
      status: 'pending',
      notes: `Fawry payment for ${customerName} (${customerPhone})`,
    }).returning('*');

    try { await logAudit({ tenantId, userId, action: 'payment.fawry_created', entityType: 'invoice', entityId: invoiceId, metadata: { amount, customerPhone, referenceNumber } }); } catch {}

    return sendSuccess(reply, {
      paymentTransactionId: paymentTx.id,
      referenceNumber,
      merchantCode,
      amount,
      customerPhone,
      customerName,
      invoiceNumber: invoice.invoice_number,
      status: 'pending',
      message: 'Fawry payment initiated. Customer should complete payment at Fawry outlet or online.',
    }, 'Fawry payment created', 201);
  });

  // ==================== INSTAPAY CREATE ====================

  app.post('/api/v1/payments/instapay', {
    preHandler: [authenticate, authorize('billing.create')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { userId } = getCtx(request);
    const { amount } = z.object({
      amount: z.number().positive(),
    }).parse(request.body);

    const walletId = env.INSTAPAY_WALLET;
    const referenceNumber = `IP-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const [paymentTx] = await db('payment_transactions').insert({
      tenant_id: tenantId,
      invoice_id: null,
      amount,
      method: 'instapay',
      reference: referenceNumber,
      status: 'pending',
      notes: 'InstaPay transfer initiated',
    }).returning('*');

    try { await logAudit({ tenantId, userId, action: 'payment.instapay_created', entityType: 'payment', entityId: paymentTx.id, metadata: { amount, referenceNumber } }); } catch {}

    return sendSuccess(reply, {
      paymentTransactionId: paymentTx.id,
      referenceNumber,
      walletId: walletId || 'PENDING_CONFIG',
      amount,
      status: 'pending',
      message: 'InstaPay details generated. Customer should transfer to the wallet and include the reference number.',
    }, 'InstaPay payment created', 201);
  });

  // ==================== ETA QR CODE ====================

  app.get('/api/v1/invoices/:id/eta-qr', {
    preHandler: [authenticate, authorize('eta_invoicing.view')],
  }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };

    const invoice = await db('invoices')
      .leftJoin('appointments as eta_appointments', 'invoices.appointment_id', 'eta_appointments.id')
      .where({ 'invoices.id': id, 'invoices.tenant_id': tenantId })
      .select('invoices.*', 'eta_appointments.branch_id as branch_id')
      .first();
    if (!invoice) return sendError(reply, 'Invoice not found', 404);

    const etaInvoice = await db('eta_invoices').where({ invoice_id: id, tenant_id: tenantId }).first();

    if (etaInvoice?.qr_code_data) {
      return sendSuccess(reply, {
        invoiceId: id,
        qrCodeData: etaInvoice.qr_code_data,
        etaUuid: etaInvoice.eta_uuid,
        etaInvoiceNumber: etaInvoice.eta_invoice_number,
        status: etaInvoice.status,
      });
    }

    const clinic = await loadClinicDocumentContext(tenantId, { branchId: invoice.branch_id || undefined });
    const sellerName = clinic.legalName || clinic.displayName;
    const taxRegNo = (env as unknown as Record<string, unknown>).TAX_REGISTRATION_NUMBER as string || '000000000000000';
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const total = Number(invoice.total);
    const vatTotal = Number(invoice.tax);

    const qrCodeData = generateEtaQrTLV(sellerName, taxRegNo, timestamp, total, vatTotal);

    if (etaInvoice) {
      await db('eta_invoices').where({ id: etaInvoice.id }).update({ qr_code_data: qrCodeData });
    } else {
      await db('eta_invoices').insert({
        tenant_id: tenantId,
        invoice_id: id,
        qr_code_data: qrCodeData,
        status: 'draft',
      });
    }

    try { await logAudit({ tenantId, userId: (getCtx(request)).userId, action: 'invoice.eta_qr_generated', entityType: 'invoice', entityId: id }); } catch {}

    return sendSuccess(reply, {
      invoiceId: id,
      qrCodeData,
      invoiceNumber: invoice.invoice_number,
      total,
      vatTotal,
      sellerName,
    });
  });

  // Module loaded
}




function generateEtaQrTLV(sellerName: string, taxRegNo: string, timestamp: string, total: number, vatTotal: number): string {
  const encodeTLV = (tag: number, value: string): string => {
    const buf = Buffer.from(value, 'utf8');
    const tagHex = tag.toString(16).padStart(2, '0');
    const lenHex = buf.length.toString(16).padStart(2, '0');
    const valHex = buf.toString('hex');
    return tagHex + lenHex + valHex;
  };

  const sellerTLV = encodeTLV(1, sellerName);
  const taxTLV = encodeTLV(2, taxRegNo);
  const timeTLV = encodeTLV(3, timestamp);
  const totalTLV = encodeTLV(4, total.toFixed(2));
  const vatTLV = encodeTLV(5, vatTotal.toFixed(2));

  return sellerTLV + taxTLV + timeTLV + totalTLV + vatTLV;
}
