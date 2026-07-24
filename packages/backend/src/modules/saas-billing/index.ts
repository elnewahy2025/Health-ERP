import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import type { SubscriptionPlanRow, UsageRecordRow } from "../types.js";

export async function registerSaasBillingModule(app: FastifyInstance) {
  // ── Subscription Plans (system-wide) ──
  app.get('/api/v1/saas/plans', async (request, reply) => {
    const plans = await db('subscription_plans').where({ is_active: true }).orderBy('sort_order');
    return sendSuccess(reply, plans.map((p: SubscriptionPlanRow) => ({
      id: p.id, name: p.name, slug: p.slug, category: p.category,
      description: p.description, priceMonthly: Number(p.price_monthly),
      priceYearly: Number(p.price_yearly), currency: p.currency,
      modules: p.modules, limits: p.limits, features: p.features,
      maxUsers: p.max_users, maxBranches: p.max_branches, maxStorageGb: p.max_storage_gb
    })));
  });

  // ── Tenant Subscription ──
  app.get('/api/v1/saas/subscription', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const sub = await db('tenant_subscriptions').where({ tenant_id: tenantId })
      .leftJoin('subscription_plans', 'tenant_subscriptions.plan_id', 'subscription_plans.id')
      .select('tenant_subscriptions.*', 'subscription_plans.name as plan_name', 'subscription_plans.slug as plan_slug',
        'subscription_plans.price_monthly', 'subscription_plans.price_yearly', 'subscription_plans.modules as plan_modules',
        'subscription_plans.features as plan_features', 'subscription_plans.max_users', 'subscription_plans.max_branches',
        'subscription_plans.max_storage_gb', 'subscription_plans.category as plan_category')
      .first();
    if (!sub) return sendSuccess(reply, null);
    return sendSuccess(reply, {
      id: sub.id, planId: sub.plan_id, planName: sub.plan_name, planSlug: sub.plan_slug,
      planCategory: sub.plan_category, planModules: sub.plan_modules, planFeatures: sub.plan_features,
      priceMonthly: Number(sub.price_monthly), priceYearly: Number(sub.price_yearly),
      maxUsers: sub.max_users, maxBranches: sub.max_branches, maxStorageGb: sub.max_storage_gb,
      status: sub.status, billingCycle: sub.billing_cycle, amount: Number(sub.amount),
      currentPeriodStart: sub.current_period_start, currentPeriodEnd: sub.current_period_end,
      trialEndsAt: sub.trial_ends_at, cancelledAt: sub.cancelled_at,
      addons: sub.addons, discounts: sub.discounts
    });
  });

  app.post('/api/v1/saas/subscription', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const plan = await db('subscription_plans').where({ id: body.planId }).first();
    if (!plan) return reply.status(404).send({ success: false, error: 'Plan not found' });
    const now = new Date(); const periodEnd = new Date(now); periodEnd.setMonth(periodEnd.getMonth() + 1);
    const [sub] = await db('tenant_subscriptions').insert({
      tenant_id: tenantId, plan_id: body.planId, status: 'active', billing_cycle: body.billingCycle || 'monthly',
      amount: body.billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly,
      current_period_start: now, current_period_end: periodEnd,
      addons: JSON.stringify(body.addons || []), discounts: JSON.stringify(body.discounts || [])
    }).returning('*');
    return sendSuccess(reply, { id: sub.id, status: sub.status }, 'Subscription created', 201);
  });

  app.put('/api/v1/saas/subscription/plan', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    const plan = await db('subscription_plans').where({ id: body.planId }).first();
    if (!plan) return reply.status(404).send({ success: false, error: 'Plan not found' });
    await db('tenant_subscriptions').where({ tenant_id: tenantId }).update({
      plan_id: body.planId, amount: body.billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly,
      billing_cycle: body.billingCycle || 'monthly', updated_at: new Date()
    });
    return sendSuccess(reply, null, 'Plan changed');
  });

  app.post('/api/v1/saas/subscription/cancel', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    await db('tenant_subscriptions').where({ tenant_id: tenantId }).update({
      status: 'cancelled', cancelled_at: new Date(), updated_at: new Date()
    });
    return sendSuccess(reply, null, 'Subscription cancelled');
  });

  // ── Usage Records ──
  app.get('/api/v1/saas/usage', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { metric, days } = request.query as { days?: string; metric?: string };
    const since = new Date(Date.now() - (Number(days) || 30) * 86400000).toISOString().split('T')[0];
    let q = db('usage_records').where({ tenant_id: tenantId }).where('record_date', '>=', since);
    if (metric) q = q.andWhere('metric', metric);
    const records = await q.orderBy('record_date', 'desc').limit(100);
    const totals = await db('usage_records').where({ tenant_id: tenantId }).where('record_date', '>=', since)
      .select('metric').sum('quantity as total').groupBy('metric');
    return sendSuccess(reply, { records: records.map((r: Record<string, unknown>) => ({ id: r.id, metric: r.metric, quantity: r.quantity, recordDate: r.record_date })), totals });
  });

  app.post('/api/v1/saas/usage/track', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const body = request.body as Record<string, unknown>;
    await db('usage_records').insert({
      tenant_id: tenantId, subscription_id: body.subscriptionId || null,
      metric: body.metric, quantity: body.quantity || 1, record_date: body.recordDate || new Date().toISOString().split('T')[0]
    });
    return sendSuccess(reply, null, 'Usage recorded', 201);
  });

  // ── Subscription Invoices ──
  app.get('/api/v1/saas/invoices', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const invoices = await db('subscription_invoices').where({ tenant_id: tenantId }).orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, invoices.map((i: Record<string, unknown>) => ({
      id: i.id, invoiceNumber: i.invoice_number, amount: Number(i.amount),
      tax: Number(i.tax), total: Number(i.total), status: i.status,
      paymentMethod: i.payment_method, paidAt: i.paid_at,
      periodStart: i.period_start, periodEnd: i.period_end, createdAt: i.created_at
    })));
  });
}
