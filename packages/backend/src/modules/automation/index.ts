import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { findTenantRow } from '../../utils/tenant-scope.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';
import { enqueueAutomationExecution, getAutomationActionDefinitions, validateAutomationAction, validateAutomationConditions, validateAutomationTriggerConfig } from '../../services/automation-service.js';
import { ValidationError } from '@healthcare/shared/errors';
import { z } from 'zod';
import crypto from 'node:crypto';

interface AutomationRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  trigger_type: string;
  trigger_event: string | null;
  trigger_config: unknown;
  conditions: unknown;
  description: string | null;
  is_active: boolean;
  priority: number;
  max_executions: number;
  cooldown_minutes: number;
  last_triggered_at: Date | null;
  next_run_at: Date | null;
  last_scheduled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AutomationRuleActionRow {
  id: string;
  rule_id: string;
  step_order: number;
  action_type: string;
  action_name: string | null;
  action_config: unknown;
  condition_override: unknown;
  is_active: boolean;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function registerAutomationModule(app: FastifyInstance) {
  // ── Rules CRUD ──
  app.get('/api/v1/automation/rules', { preHandler: [authenticate, authorize('automation.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { category, isActive, triggerType } = request.query as { category?: string; isActive?: string; triggerType?: string };
    let q = db('automation_rules').where({ tenant_id: tenantId });
    if (category) q = q.andWhere('category', category);
    if (isActive !== undefined) q = q.andWhere('is_active', isActive === 'true');
    if (triggerType) q = q.andWhere('trigger_type', triggerType);
    const rules = await q.orderBy('priority', 'desc').orderBy('name');
    return sendSuccess(reply, rules.map((r: AutomationRuleRow) => ({
      id: r.id, name: r.name, slug: r.slug, category: r.category,
      triggerType: r.trigger_type, triggerEvent: r.trigger_event,
      triggerConfig: r.trigger_config, conditions: r.conditions,
      description: r.description, isActive: r.is_active,
      priority: r.priority, maxExecutions: r.max_executions,
      cooldownMinutes: r.cooldown_minutes,
      lastTriggeredAt: r.last_triggered_at,
      nextRunAt: r.next_run_at,
      lastScheduledAt: r.last_scheduled_at,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })));
  });

  app.get('/api/v1/automation/rules/:id', { preHandler: [authenticate, authorize('automation.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const rule = await db('automation_rules').where({ tenant_id: tenantId, id }).first();
    if (!rule) return reply.status(404).send({ success: false, error: 'Rule not found' });
    const actions = await db('automation_rule_actions').where({ rule_id: id }).orderBy('step_order');
    return sendSuccess(reply, {
      ...rule,
      triggerType: rule.trigger_type, triggerEvent: rule.trigger_event,
      triggerConfig: rule.trigger_config, isActive: rule.is_active,
      maxExecutions: rule.max_executions, cooldownMinutes: rule.cooldown_minutes,
      lastTriggeredAt: rule.last_triggered_at,
      nextRunAt: rule.next_run_at,
      lastScheduledAt: rule.last_scheduled_at,
      createdAt: rule.created_at, updatedAt: rule.updated_at,
      actions: actions.map((a: AutomationRuleActionRow) => ({
        id: a.id, stepOrder: a.step_order, actionType: a.action_type,
        actionName: a.action_name, actionConfig: a.action_config,
        conditionOverride: a.condition_override, isActive: a.is_active,
      })),
    });
  });

  app.post('/api/v1/automation/rules', { preHandler: [authenticate, authorize('automation.create')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = z.object({
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9][a-z0-9_-]*$/).optional(),
      category: z.string().trim().min(1).max(50).default('general'),
      triggerType: z.enum(['manual', 'event', 'schedule']).default('manual'),
      triggerEvent: z.string().trim().max(120).nullable().optional(),
      triggerConfig: z.record(z.unknown()).default({}),
      conditions: z.array(z.unknown()).default([]),
      description: z.string().trim().max(5000).nullable().optional(),
      isActive: z.boolean().default(false),
      priority: z.number().int().min(-1000).max(1000).default(0),
      maxExecutions: z.number().int().min(0).max(1_000_000).default(0),
      cooldownMinutes: z.number().int().min(0).max(525600).default(0),
    }).parse(request.body);
    if (body.isActive) throw new ValidationError('Create the rule inactive, add at least one action, then activate it');
    const triggerConfig = validateAutomationTriggerConfig(body.triggerType, body.triggerEvent, body.triggerConfig);
    const conditions = validateAutomationConditions(body.conditions);
    const slug = body.slug || body.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const [rule] = await db('automation_rules').insert({
      tenant_id: tenantId, name: body.name, slug,
      category: body.category,
      trigger_type: body.triggerType,
      trigger_event: body.triggerEvent || null,
      trigger_config: JSON.stringify(triggerConfig),
      conditions: JSON.stringify(conditions),
      description: body.description || null,
      is_active: body.isActive,
      priority: body.priority,
      max_executions: body.maxExecutions,
      cooldown_minutes: body.cooldownMinutes,
      next_run_at: body.triggerType === 'schedule' ? new Date(String(triggerConfig.nextRunAt)) : null,
      created_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.rule_created',
      entityType: 'automation_rule',
      entityId: rule.id,
      metadata: { name: body.name, category: body.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: rule.id, name: rule.name, slug: rule.slug }, 'Rule created', 201);
  });

  app.put('/api/v1/automation/rules/:id', { preHandler: [authenticate, authorize('automation.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const existing = await db('automation_rules').where({ id, tenant_id: tenantId }).first();
    if (!existing) return reply.status(404).send({ success: false, error: 'Rule not found' });
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.name !== undefined) update.name = z.string().trim().min(1).max(200).parse(body.name);
    if (body.category !== undefined) update.category = z.string().trim().min(1).max(50).parse(body.category);
    const nextTriggerType = body.triggerType !== undefined ? z.enum(['manual', 'event', 'schedule']).parse(body.triggerType) : existing.trigger_type;
    const nextTriggerEvent = body.triggerEvent !== undefined ? body.triggerEvent : existing.trigger_event;
    const nextTriggerConfig = body.triggerConfig !== undefined ? body.triggerConfig : (typeof existing.trigger_config === 'string' ? JSON.parse(existing.trigger_config) : existing.trigger_config);
    if (body.triggerType !== undefined || body.triggerEvent !== undefined || body.triggerConfig !== undefined) {
      const validatedTriggerConfig = validateAutomationTriggerConfig(nextTriggerType, nextTriggerEvent, nextTriggerConfig);
      update.trigger_type = nextTriggerType;
      update.trigger_event = nextTriggerEvent || null;
      update.trigger_config = JSON.stringify(validatedTriggerConfig);
      update.next_run_at = nextTriggerType === 'schedule' ? new Date(String(validatedTriggerConfig.nextRunAt)) : null;
    }
    if (body.conditions !== undefined) update.conditions = JSON.stringify(validateAutomationConditions(body.conditions));
    if (body.description !== undefined) update.description = z.string().trim().max(5000).nullable().parse(body.description);
    if (body.isActive !== undefined) {
      const nextActive = z.boolean().parse(body.isActive);
      if (nextActive) {
        const actionCount = await db('automation_rule_actions').where({ rule_id: id, is_active: true }).count('id as count').first();
        if (Number((actionCount as Record<string, unknown> | undefined)?.count || 0) === 0) throw new ValidationError('Add at least one active action before activating this rule');
      }
      update.is_active = nextActive;
    }
    if (body.priority !== undefined) update.priority = z.number().int().min(-1000).max(1000).parse(body.priority);
    if (body.maxExecutions !== undefined) update.max_executions = z.number().int().min(0).max(1_000_000).parse(body.maxExecutions);
    if (body.cooldownMinutes !== undefined) update.cooldown_minutes = z.number().int().min(0).max(525600).parse(body.cooldownMinutes);
    await db('automation_rules').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.rule_updated',
      entityType: 'automation_rule',
      entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Rule updated');
  });

  app.delete('/api/v1/automation/rules/:id', { preHandler: [authenticate, authorize('automation.delete')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const existing = await findTenantRow('automation_rules', id, tenantId);
    if (!existing) return reply.status(404).send({ success: false, error: 'Rule not found' });
    await db('automation_rule_actions').where({ rule_id: id }).del();
    await db('automation_rules').where({ id, tenant_id: tenantId }).del();

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.rule_deleted',
      entityType: 'automation_rule',
      entityId: id,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Rule deleted');
  });

  // ── Rule Actions ──
  app.get('/api/v1/automation/rules/:ruleId/actions', { preHandler: [authenticate, authorize('automation.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { ruleId } = request.params as { ruleId: string };
    const rule = await findTenantRow('automation_rules', ruleId, tenantId);
    if (!rule) return reply.status(404).send({ success: false, error: 'Rule not found' });
    const actions = await db('automation_rule_actions').where({ rule_id: ruleId }).orderBy('step_order');
    return sendSuccess(reply, actions.map((a: AutomationRuleActionRow) => ({
      id: a.id, ruleId: a.rule_id, stepOrder: a.step_order,
      actionType: a.action_type, actionName: a.action_name,
      actionConfig: a.action_config, conditionOverride: a.condition_override,
      isActive: a.is_active,
    })));
  });

  app.post('/api/v1/automation/rules/:ruleId/actions', { preHandler: [authenticate, authorize('automation.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { ruleId } = request.params as { ruleId: string };
    const rule = await db('automation_rules').where({ id: ruleId, tenant_id: tenantId }).first();
    if (!rule) return reply.status(404).send({ success: false, error: 'Rule not found' });

    const body = z.object({
      stepOrder: z.number().int().min(0).max(100).optional(),
      actionType: z.string().min(1).max(100),
      actionName: z.string().trim().max(200).nullable().optional(),
      actionConfig: z.record(z.unknown()).default({}),
      conditionOverride: z.array(z.unknown()).default([]),
      isActive: z.boolean().default(true),
    }).parse(request.body);
    const validatedConfig = validateAutomationAction(body.actionType, body.actionConfig);
    const validatedConditionOverride = validateAutomationConditions(body.conditionOverride);
    const maxStep = await db('automation_rule_actions').where({ rule_id: ruleId }).max('step_order as max').first();
    const [action] = await db('automation_rule_actions').insert({
      rule_id: ruleId, step_order: body.stepOrder ?? ((maxStep as Record<string, unknown>)?.max as number ?? -1) + 1,
      action_type: body.actionType, action_name: body.actionName || null,
      action_config: JSON.stringify(validatedConfig),
      condition_override: JSON.stringify(validatedConditionOverride),
      is_active: body.isActive,
    }).returning('*');

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.action_created',
      entityType: 'automation_rule_action',
      entityId: action.id,
      metadata: { ruleId, actionType: body.actionType },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: action.id, stepOrder: action.step_order }, 'Action added', 201);
  });

  app.put('/api/v1/automation/rules/:ruleId/actions/:id', { preHandler: [authenticate, authorize('automation.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { ruleId, id } = request.params as { ruleId: string; id: string };
    const rule = await db('automation_rules').where({ id: ruleId, tenant_id: tenantId }).first();
    if (!rule) return reply.status(404).send({ success: false, error: 'Rule not found' });

    const existingAction = await db('automation_rule_actions').where({ id, rule_id: ruleId }).first();
    if (!existingAction) return reply.status(404).send({ success: false, error: 'Action not found' });
    const body = request.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (body.stepOrder !== undefined) update.step_order = z.number().int().min(0).max(100).parse(body.stepOrder);
    const nextActionType = body.actionType !== undefined ? z.string().min(1).max(100).parse(body.actionType) : existingAction.action_type;
    const currentConfig = typeof existingAction.action_config === 'string' ? JSON.parse(existingAction.action_config) : existingAction.action_config;
    if (body.actionType !== undefined || body.actionConfig !== undefined) {
      update.action_type = nextActionType;
      update.action_config = JSON.stringify(validateAutomationAction(nextActionType, body.actionConfig !== undefined ? body.actionConfig : currentConfig));
    }
    if (body.actionName !== undefined) update.action_name = z.string().trim().max(200).nullable().parse(body.actionName);
    if (body.conditionOverride !== undefined) update.condition_override = JSON.stringify(validateAutomationConditions(body.conditionOverride));
    if (body.isActive !== undefined) update.is_active = z.boolean().parse(body.isActive);
    if (Object.keys(update).length > 0) await db('automation_rule_actions').where({ id, rule_id: ruleId }).update(update);


    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.action_updated',
      entityType: 'automation_rule_action',
      entityId: id,
      metadata: { ruleId, updatedFields: Object.keys(update) },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Action updated');
  });

  app.delete('/api/v1/automation/rules/:ruleId/actions/:id', { preHandler: [authenticate, authorize('automation.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { ruleId, id } = request.params as { ruleId: string; id: string };
    const rule = await db('automation_rules').where({ id: ruleId, tenant_id: tenantId }).first();
    if (!rule) return reply.status(404).send({ success: false, error: 'Rule not found' });

    await db('automation_rule_actions').where({ id, rule_id: ruleId }).del();

    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: 'automation.action_deleted',
      entityType: 'automation_rule_action',
      entityId: id,
      metadata: { ruleId },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Action deleted');
  });

  // ── Trigger Rule Execution ──
  app.post('/api/v1/automation/rules/:id/trigger', { preHandler: [authenticate, authorize('automation.manage')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = z.object({
      referenceType: z.string().trim().max(100).nullable().optional(),
      referenceId: z.string().uuid().nullable().optional(),
      inputData: z.record(z.unknown()).default({}),
      idempotencyKey: z.string().trim().min(1).max(255).optional(),
    }).parse(request.body || {});
    const rule = await db('automation_rules').where({ tenant_id: tenantId, id }).first();
    if (!rule || !rule.is_active) return reply.status(404).send({ success: false, error: 'Active rule not found' });
    if (rule.trigger_type !== 'manual') throw new ValidationError('Only manual automation rules can be triggered from this endpoint');
    const result = await enqueueAutomationExecution({
      tenantId, ruleId: id, triggerType: 'manual', referenceType: body.referenceType, referenceId: body.referenceId,
      inputData: body.inputData, createdBy: ctx.userId,
      idempotencyKey: body.idempotencyKey || `manual:${id}:${crypto.randomUUID()}`,
    });
    await logAudit({ tenantId, userId: ctx.userId, action: 'automation.rule_queued', entityType: 'automation_rule', entityId: id, metadata: { executionId: result.execution.id, decision: result.decision }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });
    return sendSuccess(reply, { executionId: result.execution.id, status: result.decision, created: result.created }, 'Rule queued', result.created ? 202 : 200);
  });

  // ── Execution Logs ──
  app.get('/api/v1/automation/logs', { preHandler: [authenticate, authorize('automation.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { ruleId, status, limit, offset } = request.query as { ruleId?: string; status?: string; limit?: string; offset?: string };
    let q = db('automation_execution_logs').where('automation_execution_logs.tenant_id', tenantId);
    if (ruleId) q = q.andWhere('automation_execution_logs.rule_id', ruleId);
    if (status) q = q.andWhere('automation_execution_logs.status', status);
    const totalQuery = q.clone();
    const total = await totalQuery.count('id as c').first();
    const logs = await q.leftJoin('automation_rules', 'automation_execution_logs.rule_id', 'automation_rules.id')
      .select('automation_execution_logs.*', 'automation_rules.name as rule_name')
      .orderBy('created_at', 'desc')
      .limit(Number(limit) || 50)
      .offset(Number(offset) || 0);
    const executionIds = logs.map((log: Record<string, unknown>) => String(log.id));
    const steps = executionIds.length > 0
      ? await db('automation_execution_steps').where('tenant_id', tenantId).whereIn('execution_id', executionIds).orderBy('step_order')
      : [];
    const stepsByExecution = new Map<string, Record<string, unknown>[]>();
    for (const step of steps as Array<Record<string, unknown>>) {
      const key = String(step.execution_id);
      const list = stepsByExecution.get(key) || [];
      list.push({
        id: step.id, stepOrder: step.step_order, actionType: step.action_type, actionName: step.action_name,
        status: step.status, attemptCount: step.attempt_count, maxAttempts: step.max_attempts,
        availableAt: step.available_at, startedAt: step.started_at, completedAt: step.completed_at,
        outputData: step.output_data, errorCode: step.error_code, errorMessage: step.error_message,
      });
      stepsByExecution.set(key, list);
    }
    return sendSuccess(reply, {
      logs: logs.map((l: Record<string, unknown>) => ({
        id: l.id, ruleId: l.rule_id, ruleName: l.rule_name,
        triggerType: l.trigger_type, referenceType: l.reference_type,
        referenceId: l.reference_id, status: l.status,
        inputData: l.input_data, outputData: l.output_data,
        errorMessage: l.error_message, durationMs: l.duration_ms,
        startedAt: l.started_at, completedAt: l.completed_at,
        attemptCount: l.attempt_count, maxAttempts: l.max_attempts,
        nextAttemptAt: l.next_attempt_at, leaseExpiresAt: l.lease_expires_at,
        eventId: l.event_id, idempotencyKey: l.idempotency_key,
        steps: stepsByExecution.get(String(l.id)) || [],
        createdAt: l.created_at,
      })),
      total: Number((total as Record<string, unknown>)?.c || 0),
    });
  });

  // ── Get available trigger events ──
  app.get('/api/v1/automation/trigger-events', { preHandler: [authenticate, authorize('automation.view')] }, async (_request, reply) => {
    const events = [
      { id: 'appointment.created', label: 'Appointment Created', category: 'appointment' },
      { id: 'billing.invoice_created', label: 'Invoice Created', category: 'billing' },
      { id: 'billing.invoice_paid', label: 'Invoice Paid', category: 'billing' },
    ];
    return sendSuccess(reply, events);
  });

  // ── Get available action types ──
  app.get('/api/v1/automation/action-types', { preHandler: [authenticate, authorize('automation.view')] }, async (_request, reply) => {
    return sendSuccess(reply, getAutomationActionDefinitions());
  });
}
