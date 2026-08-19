import crypto from 'node:crypto';
import { parseExpression } from 'cron-parser';
import { z } from 'zod';
import { db } from '../core/database.js';
import { logAudit } from './audit.js';
import { sendNotification } from './notification.js';
import { ConflictError, ValidationError } from '@healthcare/shared/errors';

const AUTOMATION_WORKER_INTERVAL_MS = Math.max(1_000, Number(process.env.AUTOMATION_WORKER_INTERVAL_MS || 5_000));
const AUTOMATION_LEASE_MS = 60_000;
const AUTOMATION_STALE_AFTER_MS = 5 * 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const WORKER_ID = `automation-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;

export type AutomationExecutionStatus = 'queued' | 'running' | 'retry_wait' | 'completed' | 'completed_with_errors' | 'failed' | 'skipped' | 'cancelled';
export type AutomationStepStatus = 'pending' | 'running' | 'retry_wait' | 'completed' | 'failed' | 'skipped';

interface RuleRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  trigger_type: string;
  trigger_event: string | null;
  trigger_config: unknown;
  conditions: unknown;
  is_active: boolean;
  priority: number;
  max_executions: number;
  cooldown_minutes: number;
  last_triggered_at: string | Date | null;
  next_run_at: string | Date | null;
  last_scheduled_at: string | Date | null;
}

interface ActionRow {
  id: string;
  rule_id: string;
  step_order: number;
  action_type: string;
  action_name: string | null;
  action_config: unknown;
  condition_override: unknown;
  is_active: boolean;
}

interface ExecutionRow {
  id: string;
  tenant_id: string;
  rule_id: string | null;
  event_id: string | null;
  trigger_type: string | null;
  reference_type: string | null;
  reference_id: string | null;
  status: AutomationExecutionStatus;
  input_data: unknown;
  output_data: unknown;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  created_by: string | null;
  idempotency_key: string | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | Date | null;
  lease_owner: string | null;
  lease_expires_at: string | Date | null;
}

interface StepRow {
  id: string;
  tenant_id: string;
  execution_id: string;
  step_order: number;
  action_type: string;
  action_name: string | null;
  action_config: unknown;
  condition_override: unknown;
  idempotency_key: string;
  status: AutomationStepStatus;
  attempt_count: number;
  max_attempts: number;
  available_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}

interface EventRow {
  id: string;
  tenant_id: string;
  event_key: string;
  event_type: string;
  reference_type: string | null;
  reference_id: string | null;
  payload: unknown;
  status: string;
  attempt_count: number;
  max_attempts: number;
  available_at: string | Date;
}

interface ActionExecutionContext {
  tenantId: string;
  executionId: string;
  stepId: string;
  inputData: Record<string, unknown>;
  idempotencyKey: string;
}

interface ActionDefinition {
  id: string;
  label: string;
  category: string;
  fields: string[];
  retryable: boolean;
  maxAttempts: number;
}

const ACTION_DEFINITIONS: readonly ActionDefinition[] = [
  { id: 'send_notification', label: 'Send notification', category: 'communication', fields: ['channel', 'templateKey', 'recipient', 'recipientPath', 'variables', 'variablePaths'], retryable: true, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { id: 'send_email', label: 'Send email notification', category: 'communication', fields: ['templateKey', 'recipient', 'recipientPath', 'variables', 'variablePaths'], retryable: true, maxAttempts: DEFAULT_MAX_ATTEMPTS },
  { id: 'send_sms', label: 'Send SMS notification', category: 'communication', fields: ['templateKey', 'recipient', 'recipientPath', 'variables', 'variablePaths'], retryable: true, maxAttempts: DEFAULT_MAX_ATTEMPTS },
];

const safePath = z.string().min(1).max(160).regex(/^[A-Za-z0-9_.-]+$/);
const notificationConfigSchema = z.object({
  channel: z.enum(['email', 'sms']).optional(),
  templateKey: z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/),
  recipient: z.string().min(1).max(255).optional(),
  recipientPath: safePath.optional(),
  variables: z.record(z.string().max(1000)).optional().default({}),
  variablePaths: z.record(safePath).optional().default({}),
}).superRefine((value, context) => {
  if (!value.recipient && !value.recipientPath) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient'], message: 'recipient or recipientPath is required' });
  if (value.recipient && value.recipientPath) context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient'], message: 'recipient and recipientPath cannot both be set' });
});

const conditionSchema = z.object({
  path: safePath,
  operator: z.enum(['equals', 'not_equals', 'in', 'exists']),
  value: z.unknown().optional(),
});

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
}

function ensureTimeZone(value: unknown): string {
  const timezone = typeof value === 'string' && value.trim() ? value.trim() : 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new ValidationError(`Invalid automation schedule timezone: ${timezone}`);
  }
  return timezone;
}

export function nextAutomationRun(cron: string, timezone = 'UTC', currentDate = new Date()): Date {
  const expression = cron.trim();
  if (!expression) throw new ValidationError('Automation schedule cron expression is required');
  const tz = ensureTimeZone(timezone);
  try {
    return parseExpression(expression, { currentDate, tz }).next().toDate();
  } catch {
    throw new ValidationError('Invalid automation schedule cron expression');
  }
}

export function validateAutomationTriggerConfig(triggerType: unknown, triggerEvent: unknown, triggerConfig: unknown): Record<string, unknown> {
  const type = String(triggerType || 'manual');
  const config = asRecord(triggerConfig);
  if (!['manual', 'event', 'schedule'].includes(type)) throw new ValidationError('Unsupported automation trigger type');
  if (type === 'event' && (!triggerEvent || typeof triggerEvent !== 'string' || !/^[a-z][a-z0-9_.-]{2,119}$/.test(triggerEvent))) {
    throw new ValidationError('A valid trigger event is required for event-driven automation');
  }
  if (type === 'schedule') {
    const cron = typeof config.cron === 'string' ? config.cron : '';
    const timezone = ensureTimeZone(config.timezone);
    const nextRun = nextAutomationRun(cron, timezone);
    return { ...config, cron, timezone, nextRunAt: nextRun.toISOString() };
  }
  return config;
}

export function validateAutomationAction(actionType: unknown, actionConfig: unknown): Record<string, unknown> {
  const type = String(actionType || '');
  const definition = ACTION_DEFINITIONS.find((item) => item.id === type);
  if (!definition) throw new ValidationError(`Unsupported automation action type: ${type}`);
  const parsed = notificationConfigSchema.parse(asRecord(actionConfig));
  if (type === 'send_notification' && !parsed.channel) throw new ValidationError('send_notification requires an email or SMS channel');
  if (type === 'send_email' && parsed.channel && parsed.channel !== 'email') throw new ValidationError('send_email must use the email channel');
  if (type === 'send_sms' && parsed.channel && parsed.channel !== 'sms') throw new ValidationError('send_sms must use the SMS channel');
  return { ...parsed, channel: type === 'send_email' ? 'email' : type === 'send_sms' ? 'sms' : parsed.channel };
}

export function validateAutomationConditions(value: unknown): unknown[] {
  return z.array(conditionSchema).parse(value);
}

export function getAutomationActionDefinitions(): ActionDefinition[] {
  return ACTION_DEFINITIONS.map((definition) => ({ ...definition, fields: [...definition.fields] }));
}

function conditionsMatch(conditions: unknown, input: Record<string, unknown>): { matches: boolean; reason?: string } {
  const parsedConditions = parseJson<unknown>(conditions, []);
  const list = Array.isArray(parsedConditions) ? parsedConditions : Object.keys(asRecord(parsedConditions)).length === 0 ? [] : [parsedConditions];
  for (const candidate of list) {
    const parsed = conditionSchema.safeParse(candidate);
    if (!parsed.success) return { matches: false, reason: 'Invalid automation condition' };
    const actual = getPath(input, parsed.data.path);
    const expected = parsed.data.value;
    const matches = parsed.data.operator === 'exists'
      ? actual !== undefined && actual !== null
      : parsed.data.operator === 'equals'
        ? JSON.stringify(actual) === JSON.stringify(expected)
        : parsed.data.operator === 'not_equals'
          ? JSON.stringify(actual) !== JSON.stringify(expected)
          : Array.isArray(expected) && expected.some((item) => JSON.stringify(item) === JSON.stringify(actual));
    if (!matches) return { matches: false, reason: `Condition not met: ${parsed.data.path}` };
  }
  return { matches: true };
}

function parseActions(rows: ActionRow[]): Array<ActionRow & { parsedConfig: Record<string, unknown>; parsedCondition: unknown }> {
  if (rows.length === 0) throw new ValidationError('Automation rule must have at least one active action before it can run');
  return rows.map((row) => ({
    ...row,
    parsedConfig: validateAutomationAction(row.action_type, parseJson(row.action_config, {})),
    parsedCondition: parseJson(row.condition_override, {}),
  }));
}

function makeIdempotencyKey(parts: string[]): string {
  return parts.join(':').slice(0, 255);
}

function computeEventKey(input: { eventType: string; referenceType?: string | null; referenceId?: string | null; idempotencyKey?: string }): string {
  if (input.idempotencyKey) return input.idempotencyKey.slice(0, 255);
  if (input.referenceId) return `${input.eventType}:${input.referenceType || 'reference'}:${input.referenceId}`.slice(0, 255);
  const digest = crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return `${input.eventType}:payload:${digest}`.slice(0, 255);
}

export async function publishAutomationEvent(input: {
  tenantId: string;
  eventType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}) {
  if (!/^[a-z][a-z0-9_.-]{2,119}$/.test(input.eventType)) throw new ValidationError('Invalid automation event type');
  const eventKey = computeEventKey(input);
  const payload = input.payload || {};
  const [inserted] = await db('automation_events').insert({
    tenant_id: input.tenantId,
    event_key: eventKey,
    event_type: input.eventType,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    payload: JSON.stringify(payload),
    status: 'pending',
    attempt_count: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    available_at: new Date(),
    updated_at: new Date(),
  }).onConflict(['tenant_id', 'event_key']).ignore().returning('*');
  const event = inserted || await db('automation_events').where({ tenant_id: input.tenantId, event_key: eventKey }).first();
  if (!event) throw new ConflictError('Automation event could not be persisted');
  return { event: event as EventRow, created: Boolean(inserted) };
}

function backoff(attempt: number): Date {
  return new Date(Date.now() + Math.min(15 * 60_000, 1_000 * (2 ** Math.max(0, attempt - 1))));
}

async function createSkippedExecution(trx: any, input: {
  tenantId: string;
  rule: RuleRow;
  idempotencyKey: string;
  triggerType: string;
  eventId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  inputData: Record<string, unknown>;
  reason: string;
  createdBy?: string | null;
}) {
  const [row] = await trx('automation_execution_logs').insert({
    tenant_id: input.tenantId,
    rule_id: input.rule.id,
    event_id: input.eventId || null,
    trigger_type: input.triggerType,
    reference_type: input.referenceType || null,
    reference_id: input.referenceId || null,
    status: 'skipped',
    input_data: JSON.stringify(input.inputData),
    output_data: JSON.stringify({ reason: input.reason }),
    error_message: input.reason,
    duration_ms: 0,
    completed_at: new Date(),
    created_by: input.createdBy || null,
    idempotency_key: input.idempotencyKey,
    attempt_count: 0,
    max_attempts: 1,
    queued_at: new Date(),
    updated_at: new Date(),
  }).onConflict(['tenant_id', 'idempotency_key']).ignore().returning('*');
  return row || await trx('automation_execution_logs').where({ tenant_id: input.tenantId, idempotency_key: input.idempotencyKey }).first();
}

export async function enqueueAutomationExecution(input: {
  tenantId: string;
  ruleId: string;
  triggerType: string;
  inputData?: Record<string, unknown>;
  eventId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey: string;
  createdBy?: string | null;
}) {
  const idempotencyKey = input.idempotencyKey.slice(0, 255);
  return db.transaction(async (trx) => {
    const rule = await trx('automation_rules').where({ id: input.ruleId, tenant_id: input.tenantId }).forUpdate().first() as RuleRow | undefined;
    if (!rule || !rule.is_active) throw new ConflictError('Active automation rule not found');
    const existing = await trx('automation_execution_logs').where({ tenant_id: input.tenantId, idempotency_key: idempotencyKey }).first() as ExecutionRow | undefined;
    if (existing) return { execution: existing, created: false, decision: existing.status };

    const now = new Date();
    const inputData = input.inputData || {};
    if (rule.max_executions > 0) {
      const countRow = await trx('automation_execution_logs').where({ tenant_id: input.tenantId, rule_id: rule.id }).count('id as count').first();
      if (Number((countRow as Record<string, unknown> | undefined)?.count || 0) >= rule.max_executions) {
        const skipped = await createSkippedExecution(trx, { ...input, rule, idempotencyKey, inputData, reason: 'Maximum executions reached' });
        return { execution: skipped, created: true, decision: 'skipped' };
      }
    }
    if (rule.cooldown_minutes > 0 && rule.last_triggered_at) {
      const cooldownUntil = new Date(new Date(rule.last_triggered_at).getTime() + rule.cooldown_minutes * 60_000);
      if (cooldownUntil > now) {
        const skipped = await createSkippedExecution(trx, { ...input, rule, idempotencyKey, inputData, reason: 'Rule is in cooldown period' });
        return { execution: skipped, created: true, decision: 'skipped' };
      }
    }

    const actions = await trx('automation_rule_actions').where({ rule_id: rule.id, is_active: true }).orderBy('step_order') as ActionRow[];
    const parsedActions = parseActions(actions);
    const [execution] = await trx('automation_execution_logs').insert({
      tenant_id: input.tenantId,
      rule_id: rule.id,
      event_id: input.eventId || null,
      trigger_type: input.triggerType,
      reference_type: input.referenceType || null,
      reference_id: input.referenceId || null,
      status: 'queued',
      input_data: JSON.stringify(inputData),
      output_data: JSON.stringify({}),
      error_message: null,
      duration_ms: 0,
      created_by: input.createdBy || null,
      idempotency_key: idempotencyKey,
      attempt_count: 0,
      max_attempts: 1,
      next_attempt_at: now,
      queued_at: now,
      updated_at: now,
    }).returning('*');
    for (const action of parsedActions) {
      const definition = ACTION_DEFINITIONS.find((item) => item.id === action.action_type)!;
      await trx('automation_execution_steps').insert({
        tenant_id: input.tenantId,
        execution_id: execution.id,
        step_order: action.step_order,
        action_type: action.action_type,
        action_name: action.action_name,
        action_config: JSON.stringify(action.parsedConfig),
        condition_override: JSON.stringify(action.parsedCondition),
        idempotency_key: makeIdempotencyKey([idempotencyKey, 'step', String(action.step_order)]),
        status: 'pending',
        attempt_count: 0,
        max_attempts: definition.retryable ? definition.maxAttempts : 1,
        available_at: now,
        updated_at: now,
      });
    }
    await trx('automation_rules').where({ id: rule.id, tenant_id: input.tenantId }).update({ last_triggered_at: now, updated_at: now });
    return { execution: execution as ExecutionRow, created: true, decision: 'queued' };
  });
}

async function claimNextEvent(): Promise<EventRow | null> {
  return db.transaction(async (trx) => {
    const now = new Date();
    const row = await trx('automation_events').whereIn('status', ['pending', 'retry_wait']).where('available_at', '<=', now).andWhere((query) => query.whereNull('locked_until').orWhere('locked_until', '<', now)).orderBy('created_at', 'asc').forUpdate().skipLocked().first() as EventRow | undefined;
    if (!row) return null;
    const attemptCount = Number(row.attempt_count || 0) + 1;
    await trx('automation_events').where({ id: row.id, tenant_id: row.tenant_id }).update({ status: 'running', attempt_count: attemptCount, locked_by: WORKER_ID, locked_until: new Date(Date.now() + AUTOMATION_LEASE_MS), updated_at: now });
    return { ...row, status: 'running', attempt_count: attemptCount };
  });
}

async function recoverStaleAutomationState(): Promise<void> {
  const cutoff = new Date(Date.now() - AUTOMATION_STALE_AFTER_MS);
  await db('automation_events').where({ status: 'running' }).where('locked_until', '<', new Date()).update({ status: 'retry_wait', available_at: new Date(), locked_by: null, locked_until: null, last_error: 'Recovered after automation worker interruption', updated_at: new Date() });
  await db('automation_execution_steps').where({ status: 'running' }).where('locked_until', '<', new Date()).update({ status: 'retry_wait', available_at: new Date(), locked_by: null, locked_until: null, error_code: 'STALE_LEASE', error_message: 'Recovered after automation worker interruption', updated_at: new Date() });
  await db('automation_execution_logs').where({ status: 'running' }).where(function (query) { query.where('lease_expires_at', '<', new Date()).orWhere('started_at', '<', cutoff); }).update({ status: 'retry_wait', next_attempt_at: new Date(), lease_owner: null, lease_expires_at: null, error_message: 'Recovered after automation worker interruption', updated_at: new Date() });
}

async function processEvent(event: EventRow): Promise<void> {
  const payload = asRecord(parseJson(event.payload, {}));
  const rules = await db('automation_rules').where({ tenant_id: event.tenant_id, trigger_type: 'event', trigger_event: event.event_type, is_active: true }).orderBy('priority', 'desc') as RuleRow[];
  const failures: string[] = [];
  for (const rule of rules) {
    try {
      const condition = conditionsMatch(rule.conditions, payload);
      if (!condition.matches) {
        await db.transaction(async (trx) => {
          await createSkippedExecution(trx, { tenantId: event.tenant_id, rule, idempotencyKey: makeIdempotencyKey([event.event_key, 'rule', rule.id]), triggerType: 'event', eventId: event.id, referenceType: event.reference_type, referenceId: event.reference_id, inputData: payload, reason: condition.reason || 'Conditions not met' });
        });
        continue;
      }
      await enqueueAutomationExecution({ tenantId: event.tenant_id, ruleId: rule.id, triggerType: 'event', eventId: event.id, referenceType: event.reference_type, referenceId: event.reference_id, inputData: payload, idempotencyKey: makeIdempotencyKey([event.event_key, 'rule', rule.id]) });
    } catch (error) {
      failures.push(error instanceof Error ? error.message : 'Automation event rule dispatch failed');
    }
  }
  await db('automation_events').where({ id: event.id, tenant_id: event.tenant_id }).update({ status: failures.length > 0 ? 'completed_with_errors' : 'completed', processed_at: new Date(), locked_by: null, locked_until: null, last_error: failures.length > 0 ? failures.join('; ').slice(0, 2000) : null, updated_at: new Date() });
  await logAudit({ tenantId: event.tenant_id, action: failures.length > 0 ? 'automation.event_completed_with_errors' : 'automation.event_completed', entityType: 'automation_event', entityId: event.id, metadata: { eventType: event.event_type, ruleCount: rules.length, failures }, result: failures.length > 0 ? 'failed' : 'success' });
}

async function claimDueSchedule(): Promise<{ rule: RuleRow; scheduledAt: Date } | null> {
  return db.transaction(async (trx) => {
    const now = new Date();
    const rule = await trx('automation_rules').where({ trigger_type: 'schedule', is_active: true }).where(function (query) { query.whereNull('next_run_at').orWhere('next_run_at', '<=', now); }).orderBy('next_run_at', 'asc').forUpdate().skipLocked().first() as RuleRow | undefined;
    if (!rule) return null;
    const config = asRecord(parseJson(rule.trigger_config, {}));
    const timezone = ensureTimeZone(config.timezone);
    if (!rule.next_run_at) {
      const nextRun = nextAutomationRun(String(config.cron || ''), timezone, now);
      await trx('automation_rules').where({ id: rule.id, tenant_id: rule.tenant_id }).update({ next_run_at: nextRun, updated_at: now });
      return null;
    }
    const scheduledAt = new Date(rule.next_run_at);
    const nextRun = nextAutomationRun(String(config.cron || ''), timezone, scheduledAt);
    await trx('automation_rules').where({ id: rule.id, tenant_id: rule.tenant_id }).update({ next_run_at: nextRun, last_scheduled_at: scheduledAt, updated_at: now });
    return { rule, scheduledAt };
  });
}

async function claimNextExecution(): Promise<ExecutionRow | null> {
  return db.transaction(async (trx) => {
    const now = new Date();
    const execution = await trx('automation_execution_logs').whereIn('status', ['queued', 'retry_wait']).where(function (query) { query.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', now); }).where(function (query) { query.whereNull('lease_expires_at').orWhere('lease_expires_at', '<', now); }).orderBy('queued_at', 'asc').forUpdate().skipLocked().first() as ExecutionRow | undefined;
    if (!execution) return null;
    const attemptCount = Number(execution.attempt_count || 0) + 1;
    await trx('automation_execution_logs').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'running', attempt_count: attemptCount, started_at: execution.started_at || now, lease_owner: WORKER_ID, lease_expires_at: new Date(Date.now() + AUTOMATION_LEASE_MS), updated_at: now });
    return { ...execution, status: 'running', attempt_count: attemptCount };
  });
}

function resolveNotificationConfig(config: Record<string, unknown>, inputData: Record<string, unknown>, actionType: string) {
  const parsed = validateAutomationAction(actionType, config);
  const recipient = parsed.recipientPath ? getPath(inputData, String(parsed.recipientPath)) : parsed.recipient;
  if (typeof recipient !== 'string' || !recipient.trim()) throw new ValidationError('Automation notification recipient could not be resolved from the event data');
  const variables = { ...asRecord(parsed.variables) } as Record<string, string>;
  for (const [key, path] of Object.entries(asRecord(parsed.variablePaths))) {
    const value = getPath(inputData, String(path));
    if (value !== undefined && value !== null) variables[key] = String(value);
  }
  return { channel: parsed.channel as 'email' | 'sms', recipient: recipient.trim(), templateKey: String(parsed.templateKey), variables };
}

async function executeAction(action: StepRow, context: ActionExecutionContext): Promise<Record<string, unknown>> {
  if (!ACTION_DEFINITIONS.some((definition) => definition.id === action.action_type)) throw new ValidationError(`Unsupported automation action type: ${action.action_type}`);
  const config = asRecord(parseJson(action.action_config, {}));
  const resolved = resolveNotificationConfig(config, context.inputData, action.action_type);
  const sent = await sendNotification({ tenantId: context.tenantId, channel: resolved.channel, recipient: resolved.recipient, templateKey: resolved.templateKey, variables: resolved.variables, idempotencyKey: context.idempotencyKey });
  if (!sent) throw new AutomationActionError('NOTIFICATION_SEND_FAILED', 'Notification provider did not accept the message', true);
  return { channel: resolved.channel, templateKey: resolved.templateKey, recipient: resolved.recipient, sent: true };
}

class AutomationActionError extends Error {
  constructor(public readonly code: string, message: string, public readonly retryable: boolean) {
    super(message);
  }
}

async function processExecution(execution: ExecutionRow): Promise<void> {
  const inputData = asRecord(parseJson(execution.input_data, {}));
  const rule = execution.rule_id ? await db('automation_rules').where({ id: execution.rule_id, tenant_id: execution.tenant_id }).first() as RuleRow | undefined : undefined;
  if (!rule) throw new ConflictError('Automation rule no longer exists');
  const condition = conditionsMatch(rule.conditions, inputData);
  if (!condition.matches) {
    await db('automation_execution_logs').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'skipped', output_data: JSON.stringify({ reason: condition.reason || 'Conditions not met' }), error_message: condition.reason || 'Conditions not met', completed_at: new Date(), lease_owner: null, lease_expires_at: null, updated_at: new Date() });
    return;
  }
  const steps = await db('automation_execution_steps').where({ execution_id: execution.id, tenant_id: execution.tenant_id }).orderBy('step_order') as StepRow[];
  let hadErrors = false;
  for (const step of steps) {
    if (step.status === 'completed' || step.status === 'skipped') continue;
    const stepCondition = conditionsMatch(step.condition_override, inputData);
    if (!stepCondition.matches) {
      await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'skipped', output_data: JSON.stringify({ reason: stepCondition.reason || 'Step condition not met' }), completed_at: new Date(), updated_at: new Date() });
      continue;
    }
    const definition = ACTION_DEFINITIONS.find((item) => item.id === step.action_type);
    if (!definition) {
      hadErrors = true;
      await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'failed', error_code: 'ACTION_NOT_ALLOWED', error_message: `Unsupported automation action type: ${step.action_type}`, completed_at: new Date(), updated_at: new Date() });
      break;
    }
    const attempt = Number(step.attempt_count || 0) + 1;
    await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'running', attempt_count: attempt, started_at: step.started_at || new Date(), locked_by: WORKER_ID, locked_until: new Date(Date.now() + AUTOMATION_LEASE_MS), updated_at: new Date() });
    try {
      const output = await executeAction(step, { tenantId: execution.tenant_id, executionId: execution.id, stepId: step.id, inputData, idempotencyKey: step.idempotency_key });
      await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'completed', output_data: JSON.stringify(output), completed_at: new Date(), locked_by: null, locked_until: null, error_code: null, error_message: null, updated_at: new Date() });
    } catch (error) {
      const retryable = error instanceof AutomationActionError ? error.retryable : false;
      const message = error instanceof Error ? error.message : 'Automation action failed';
      const code = error instanceof AutomationActionError ? error.code : 'ACTION_FAILED';
      if (retryable && attempt < step.max_attempts) {
        await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'retry_wait', available_at: backoff(attempt), error_code: code, error_message: message, locked_by: null, locked_until: null, updated_at: new Date() });
        await db('automation_execution_logs').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'retry_wait', next_attempt_at: backoff(attempt), error_message: message, lease_owner: null, lease_expires_at: null, updated_at: new Date() });
        return;
      }
      hadErrors = true;
      await db('automation_execution_steps').where({ id: step.id, tenant_id: execution.tenant_id }).update({ status: 'failed', error_code: code, error_message: message, completed_at: new Date(), locked_by: null, locked_until: null, updated_at: new Date() });
      break;
    }
  }
  const remaining = await db('automation_execution_steps').where({ execution_id: execution.id, tenant_id: execution.tenant_id }).whereIn('status', ['pending', 'running', 'retry_wait']).count('id as count').first();
  if (Number((remaining as Record<string, unknown> | undefined)?.count || 0) > 0) return;
  const failed = await db('automation_execution_steps').where({ execution_id: execution.id, tenant_id: execution.tenant_id }).where('status', 'failed').count('id as count').first();
  const finalStatus: AutomationExecutionStatus = Number((failed as Record<string, unknown> | undefined)?.count || 0) > 0 || hadErrors ? 'failed' : 'completed';
  await db('automation_execution_logs').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: finalStatus, output_data: JSON.stringify({ completedAt: new Date().toISOString() }), error_message: finalStatus === 'failed' ? 'One or more automation steps failed' : null, completed_at: new Date(), duration_ms: execution.started_at ? Date.now() - new Date(execution.started_at).getTime() : 0, lease_owner: null, lease_expires_at: null, updated_at: new Date() });
  await logAudit({ tenantId: execution.tenant_id, userId: execution.created_by || undefined, action: finalStatus === 'completed' ? 'automation.execution_completed' : 'automation.execution_failed', entityType: 'automation_execution', entityId: execution.id, metadata: { ruleId: execution.rule_id, status: finalStatus }, result: finalStatus === 'completed' ? 'success' : 'failed' });
}

export async function processPendingAutomationOnce(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverStaleAutomationState();
    const event = await claimNextEvent();
    if (event) {
      try {
        await processEvent(event);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automation event processing failed';
        await db('automation_events').where({ id: event.id, tenant_id: event.tenant_id }).update({ status: event.attempt_count < event.max_attempts ? 'retry_wait' : 'failed', available_at: event.attempt_count < event.max_attempts ? backoff(event.attempt_count) : new Date(), locked_by: null, locked_until: null, last_error: message, updated_at: new Date() });
      }
    }
    const schedule = await claimDueSchedule();
    if (schedule) {
      try {
        await enqueueAutomationExecution({ tenantId: schedule.rule.tenant_id, ruleId: schedule.rule.id, triggerType: 'schedule', inputData: { scheduledAt: schedule.scheduledAt.toISOString() }, referenceType: 'automation_schedule', referenceId: schedule.rule.id, idempotencyKey: makeIdempotencyKey([schedule.rule.id, 'schedule', schedule.scheduledAt.toISOString()]) });
      } catch (error) {
        await logAudit({ tenantId: schedule.rule.tenant_id, action: 'automation.schedule_dispatch_failed', entityType: 'automation_rule', entityId: schedule.rule.id, metadata: { error: error instanceof Error ? error.message : 'Schedule dispatch failed' }, result: 'failed' });
      }
    }
    const execution = await claimNextExecution();
    if (execution) {
      try {
        await processExecution(execution);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Automation execution failed';
        await db('automation_execution_logs').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'failed', error_message: message, completed_at: new Date(), lease_owner: null, lease_expires_at: null, updated_at: new Date() });
        await logAudit({ tenantId: execution.tenant_id, userId: execution.created_by || undefined, action: 'automation.execution_failed', entityType: 'automation_execution', entityId: execution.id, metadata: { error: message }, result: 'failed' });
      }
    }
  } finally {
    workerRunning = false;
  }
}

let workerInterval: NodeJS.Timeout | null = null;
let workerRunning = false;

export function startAutomationWorker(): void {
  if (workerInterval) return;
  processPendingAutomationOnce().catch((error) => console.error('Automation worker error:', error));
  workerInterval = setInterval(() => processPendingAutomationOnce().catch((error) => console.error('Automation worker error:', error)), AUTOMATION_WORKER_INTERVAL_MS);
  workerInterval.unref();
}

export function stopAutomationWorker(): void {
  if (!workerInterval) return;
  clearInterval(workerInterval);
  workerInterval = null;
}
