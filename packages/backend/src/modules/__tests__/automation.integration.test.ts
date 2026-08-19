import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '../../services/authorization.js';
import { errorHandler } from '../../core/error-handler.js';
import { db } from '../../core/database.js';
import { enqueueAutomationExecution, nextAutomationRun, processPendingAutomationOnce, publishAutomationEvent } from '../../services/automation-service.js';

const { sendNotificationMock } = vi.hoisted(() => ({ sendNotificationMock: vi.fn().mockResolvedValue(true) }));
vi.mock('../../services/notification.js', () => ({ sendNotification: sendNotificationMock }));
vi.mock('../../services/clinic-modules.js', () => ({ enforceClinicModuleForPermission: vi.fn().mockResolvedValue(undefined) }));

const { registerAutomationModule } = await import('../automation/index.js');
const enabled = process.env.RUN_AUTOMATION_DB_TESTS === 'true';
const describeDatabase = enabled ? describe : describe.skip;

const IDS = {
  tenant: 'd1000000-0000-0000-0000-000000000001',
  otherTenant: 'd1000000-0000-0000-0000-000000000002',
  user: 'd2000000-0000-0000-0000-000000000001',
  rule: 'd3000000-0000-0000-0000-000000000001',
  eventRule: 'd3000000-0000-0000-0000-000000000002',
  retryRule: 'd3000000-0000-0000-0000-000000000003',
  foreignRule: 'd3000000-0000-0000-0000-000000000004',
};

function currentPrincipal(): Principal {
  return {
    kind: 'user', id: IDS.user, tenantId: IDS.tenant, roles: [],
    grants: [
      { permission: 'automation.view', scope: 'tenant' },
      { permission: 'automation.create', scope: 'tenant' },
      { permission: 'automation.edit', scope: 'tenant' },
      { permission: 'automation.delete', scope: 'tenant' },
      { permission: 'automation.manage', scope: 'tenant' },
    ],
    denials: [], branches: [], membership: { branchId: null } as Principal['membership'], departmentId: null,
    locale: 'en', permVersion: 1, status: 'active',
  };
}

describeDatabase('durable automation PostgreSQL integration suite', () => {
  let app: FastifyInstance;
  const principal = currentPrincipal();

  beforeAll(async () => {
    await db.transaction(async (trx) => {
      await trx('automation_execution_steps').where({ tenant_id: IDS.tenant }).delete();
      await trx('automation_execution_logs').where({ tenant_id: IDS.tenant }).delete();
      await trx('automation_events').where({ tenant_id: IDS.tenant }).delete();
      await trx('automation_rule_actions').whereIn('rule_id', [IDS.rule, IDS.eventRule, IDS.retryRule, IDS.foreignRule]).delete();
      await trx('automation_rules').whereIn('tenant_id', [IDS.tenant, IDS.otherTenant]).delete();
      await trx('users').where({ id: IDS.user }).delete();
      await trx('tenants').whereIn('id', [IDS.tenant, IDS.otherTenant]).delete();
      await trx('tenants').insert([
        { id: IDS.tenant, name: 'Automation Clinic', slug: 'automation-clinic', status: 'active' },
        { id: IDS.otherTenant, name: 'Other Clinic', slug: 'other-clinic', status: 'active' },
      ]);
      await trx('users').insert({ id: IDS.user, tenant_id: IDS.tenant, email: 'automation@example.test', password_hash: 'not-used', first_name: 'Automation', last_name: 'Tester', status: 'active' });
      await trx('automation_rules').insert([
        { id: IDS.rule, tenant_id: IDS.tenant, name: 'Manual invoice notice', slug: 'manual_invoice_notice', category: 'billing', trigger_type: 'manual', trigger_config: JSON.stringify({}), conditions: JSON.stringify([]), is_active: true, priority: 1, max_executions: 1, cooldown_minutes: 0, created_by: IDS.user },
        { id: IDS.eventRule, tenant_id: IDS.tenant, name: 'Paid invoice notice', slug: 'paid_invoice_notice', category: 'billing', trigger_type: 'event', trigger_event: 'billing.invoice_paid', trigger_config: JSON.stringify({}), conditions: JSON.stringify([{ path: 'amount', operator: 'exists' }]), is_active: true, priority: 1, max_executions: 0, cooldown_minutes: 0, created_by: IDS.user },
        { id: IDS.retryRule, tenant_id: IDS.tenant, name: 'Retry invoice notice', slug: 'retry_invoice_notice', category: 'billing', trigger_type: 'manual', trigger_config: JSON.stringify({}), conditions: JSON.stringify([]), is_active: true, priority: 1, max_executions: 0, cooldown_minutes: 0, created_by: IDS.user },
        { id: IDS.foreignRule, tenant_id: IDS.otherTenant, name: 'Foreign rule', slug: 'foreign_rule', category: 'billing', trigger_type: 'manual', trigger_config: JSON.stringify({}), conditions: JSON.stringify([]), is_active: true, priority: 1, max_executions: 0, cooldown_minutes: 0, created_by: null },
      ]);
      await trx('automation_rule_actions').insert([
        { rule_id: IDS.rule, step_order: 0, action_type: 'send_email', action_name: 'Email notice', action_config: JSON.stringify({ templateKey: 'invoice.paid', recipientPath: 'patient.email', variables: {}, variablePaths: { amount: 'amount' } }), condition_override: JSON.stringify([]), is_active: true },
        { rule_id: IDS.eventRule, step_order: 0, action_type: 'send_email', action_name: 'Paid notice', action_config: JSON.stringify({ templateKey: 'invoice.paid', recipientPath: 'patient.email', variables: {}, variablePaths: { invoiceNumber: 'invoiceNumber' } }), condition_override: JSON.stringify([]), is_active: true },
        { rule_id: IDS.retryRule, step_order: 0, action_type: 'send_email', action_name: 'Retry notice', action_config: JSON.stringify({ templateKey: 'invoice.paid', recipientPath: 'patient.email', variables: {} }), condition_override: JSON.stringify([]), is_active: true },
      ]);
    });

    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorate('authenticate', async (request: FastifyRequest) => {
      const req = request as any;
      req.tenantId = principal.tenantId;
      req.ctx = { tenantId: principal.tenantId, userId: principal.id, roles: principal.roles, permissions: principal.grants.map((grant) => grant.permission), branches: principal.branches, locale: principal.locale, requestId: request.id, principal };
    });
    await registerAutomationModule(app);
    sendNotificationMock.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
    await db('automation_execution_steps').where({ tenant_id: IDS.tenant }).delete();
    await db('automation_execution_logs').where({ tenant_id: IDS.tenant }).delete();
    await db('automation_events').where({ tenant_id: IDS.tenant }).delete();
    await db('automation_rule_actions').whereIn('rule_id', [IDS.rule, IDS.eventRule, IDS.retryRule, IDS.foreignRule]).delete();
    await db('automation_rules').whereIn('tenant_id', [IDS.tenant, IDS.otherTenant]).delete();
    await db('users').where({ id: IDS.user }).delete();
    await db('tenants').whereIn('id', [IDS.tenant, IDS.otherTenant]).delete();
    await db.destroy();
  });

  it('queues a manual rule, executes an allowlisted notification action, and records per-step evidence', async () => {
    sendNotificationMock.mockClear();
    const response = await app.inject({ method: 'POST', url: `/api/v1/automation/rules/${IDS.rule}/trigger`, payload: { inputData: { amount: '100.00', patient: { email: 'patient@example.test' } } } });
    expect(response.statusCode).toBe(202);
    expect(response.json().data).toMatchObject({ status: 'queued', created: true });
    const executionId = response.json().data.executionId as string;

    await processPendingAutomationOnce();
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: IDS.tenant, channel: 'email', recipient: 'patient@example.test', idempotencyKey: expect.stringContaining(`manual:${IDS.rule}:`) }));
    expect(await db('automation_execution_logs').where({ id: executionId, tenant_id: IDS.tenant }).first()).toMatchObject({ status: 'completed' });
    expect(await db('automation_execution_steps').where({ execution_id: executionId, tenant_id: IDS.tenant }).first()).toMatchObject({ status: 'completed', attempt_count: 1 });

    const second = await app.inject({ method: 'POST', url: `/api/v1/automation/rules/${IDS.rule}/trigger`, payload: { inputData: { amount: '100.00', patient: { email: 'patient@example.test' } } } });
    expect(second.statusCode).toBe(202);
    expect(second.json().data.status).toBe('skipped');
    expect(await db('automation_execution_logs').where({ tenant_id: IDS.tenant, rule_id: IDS.rule })).toHaveLength(2);
  });

  it('deduplicates durable events and executes matching event rules through the worker', async () => {
    sendNotificationMock.mockClear();
    const first = await publishAutomationEvent({ tenantId: IDS.tenant, eventType: 'billing.invoice_paid', referenceType: 'invoice', referenceId: 'd4000000-0000-0000-0000-000000000001', payload: { amount: 100, invoiceNumber: 'INV-001', patient: { email: 'paid@example.test' } }, idempotencyKey: 'billing.invoice_paid:d4000000-0000-0000-0000-000000000001' });
    const duplicate = await publishAutomationEvent({ tenantId: IDS.tenant, eventType: 'billing.invoice_paid', referenceType: 'invoice', referenceId: 'd4000000-0000-0000-0000-000000000001', payload: { amount: 100, invoiceNumber: 'INV-001', patient: { email: 'paid@example.test' } }, idempotencyKey: 'billing.invoice_paid:d4000000-0000-0000-0000-000000000001' });
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    await processPendingAutomationOnce();
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(await db('automation_events').where({ tenant_id: IDS.tenant, event_key: 'billing.invoice_paid:d4000000-0000-0000-0000-000000000001' }).first()).toMatchObject({ status: 'completed' });
    expect(await db('automation_execution_logs').where({ tenant_id: IDS.tenant, rule_id: IDS.eventRule })).toHaveLength(1);
  });

  it('recovers a stale lease and retries only the idempotent notification step', async () => {
    sendNotificationMock.mockReset();
    sendNotificationMock.mockResolvedValueOnce(false).mockResolvedValue(true);
    const response = await app.inject({ method: 'POST', url: `/api/v1/automation/rules/${IDS.retryRule}/trigger`, payload: { inputData: { patient: { email: 'retry@example.test' } } } });
    expect(response.statusCode).toBe(202);
    const executionId = response.json().data.executionId as string;
    await processPendingAutomationOnce();
    expect(await db('automation_execution_logs').where({ id: executionId, tenant_id: IDS.tenant }).first()).toMatchObject({ status: 'retry_wait' });
    await db('automation_execution_logs').where({ id: executionId, tenant_id: IDS.tenant }).update({ status: 'running', next_attempt_at: new Date(Date.now() - 1000), lease_expires_at: new Date(Date.now() - 1000) });
    await db('automation_execution_steps').where({ execution_id: executionId, tenant_id: IDS.tenant }).update({ status: 'running', locked_until: new Date(Date.now() - 1000) });
    await processPendingAutomationOnce();
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(await db('automation_execution_logs').where({ id: executionId, tenant_id: IDS.tenant }).first()).toMatchObject({ status: 'completed' });
  });

  it('calculates timezone-aware cron runs and preserves permission and tenant boundaries', async () => {
    const next = nextAutomationRun('*/15 * * * *', 'UTC', new Date('2026-08-19T12:01:00.000Z'));
    expect(next.toISOString()).toBe('2026-08-19T12:15:00.000Z');

    principal.grants = [{ permission: 'automation.view', scope: 'tenant' }];
    const forbiddenCreate = await app.inject({ method: 'POST', url: '/api/v1/automation/rules', payload: { name: 'Not allowed' } });
    expect(forbiddenCreate.statusCode).toBe(403);
    principal.grants = [
      { permission: 'automation.view', scope: 'tenant' },
      { permission: 'automation.manage', scope: 'tenant' },
    ];
    const foreignTrigger = await app.inject({ method: 'POST', url: `/api/v1/automation/rules/${IDS.foreignRule}/trigger`, payload: {} });
    expect(foreignTrigger.statusCode).toBe(404);
  });
});
