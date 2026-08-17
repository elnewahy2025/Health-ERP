import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize, type Principal } from '../../services/authorization.js';
import { applyScopePolicy } from '../../services/scope-policy.js';
import type { PermissionScope } from '@healthcare/shared/authz';
import { ForbiddenError } from '@healthcare/shared/errors';
import { logAudit } from '../../services/audit.js';

export async function registerHrModule(app: FastifyInstance) {
  const resolveHrScope = (principal: Principal): PermissionScope =>
    principal.grants.find((grant) => grant.permission === 'hr.view' || grant.permission === '*')?.scope || 'tenant';

  app.get('/api/v1/hr/employees', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { department, status } = request.query as { department?: string; status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveHrScope(principal);
    let q = db('employees').where('employees.tenant_id', tenantId).whereNull('employees.deleted_at');
    q = applyScopePolicy('hr', q, principal, scope) as typeof q;
    if (department) q = q.andWhere('employees.department', department);
    if (status) q = q.andWhere('employees.status', status);
    const employees = await q.select('employees.*').orderBy('last_name');
    return sendSuccess(reply, employees.map((e: Record<string, unknown>) => ({
      id: e.id, employeeCode: e.employee_code, firstName: e.first_name, lastName: e.last_name,
      email: e.email, phone: e.phone, department: e.department, position: e.position,
      employmentType: e.employment_type, hireDate: e.hire_date, baseSalary: e.base_salary,
      payFrequency: e.pay_frequency, status: e.status,
    })));
  });

  app.post('/api/v1/hr/employees', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const empCode = "EMP-" + Date.now().toString(36).toUpperCase();
    const [emp] = await db('employees').insert({ tenant_id: tenantId, employee_code: body.employeeCode || empCode, first_name: body.firstName, last_name: body.lastName, email: body.email, phone: body.phone, department: body.department, department_id: body.departmentId || null, branch_id: body.branchId || null, position: body.position, employment_type: body.employmentType || 'full_time', hire_date: body.hireDate, base_salary: body.baseSalary || 0, pay_frequency: body.payFrequency || 'monthly', created_by: ctx.userId }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'hr.employee_created', entityType: 'employee', entityId: emp.id, metadata: { employeeCode: empCode, department: body.department }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, emp, 'Employee added', 201);
  });

  app.get('/api/v1/hr/attendance', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { date } = request.query as { date?: string };
    const principal = getCtx(request).principal;
    const scope = resolveHrScope(principal);
    let q = db('attendance').join('employees', 'attendance.employee_id', 'employees.id').where('attendance.tenant_id', tenantId);
    q = applyScopePolicy('hr_attendance', q, principal, scope) as typeof q;
    if (date) q = q.andWhereRaw("DATE(attendance.date) = ?", [date]);
    const records = await q.orderBy('date', 'desc').limit(100);
    return sendSuccess(reply, records);
  });

  app.get('/api/v1/hr/leave-requests', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status } = request.query as { status?: string };
    const principal = getCtx(request).principal;
    const scope = resolveHrScope(principal);
    let q = db('leave_requests')
      .leftJoin('employees', 'leave_requests.employee_id', 'employees.id')
      .where('leave_requests.tenant_id', tenantId);
    q = applyScopePolicy('hr_leave', q, principal, scope) as typeof q;
    q = q.select('leave_requests.*', 'employees.first_name as emp_first_name', 'employees.last_name as emp_last_name');
    if (status) q = q.andWhere('leave_requests.status', status);
    const requests = await q.orderBy('leave_requests.created_at', 'desc').limit(50);
    return sendSuccess(reply, requests.map((r: Record<string, unknown>) => ({
      id: r.id, employeeId: r.employee_id,
      employeeName: r.emp_first_name ? `${r.emp_first_name} ${r.emp_last_name}` : null,
      leaveType: r.leave_type, startDate: r.start_date, endDate: r.end_date,
      totalDays: r.total_days, reason: r.reason, status: r.status,
      managerNotes: r.manager_notes, createdAt: r.created_at,
    })));
  });

  app.post('/api/v1/hr/leave-requests', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const start = new Date(String(body.startDate));
    const end = new Date(String(body.endDate));
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
    const principal = ctx.principal;
    const scope = resolveHrScope(principal);
    const employee = await applyScopePolicy('hr', db('employees').where({ 'employees.id': body.employeeId, 'employees.tenant_id': tenantId }), principal, scope).first();
    if (!employee) throw new ForbiddenError('You do not have access to this employee');
    const [lr] = await db('leave_requests').insert({ tenant_id: tenantId, employee_id: body.employeeId, leave_type: body.leaveType || 'annual', start_date: body.startDate, end_date: body.endDate, total_days: days, reason: body.reason, created_by: ctx.userId }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'hr.leave_requested', entityType: 'leave_request', entityId: lr.id, metadata: { employeeId: body.employeeId, days }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, lr, 'Leave request submitted', 201);
  });

  app.put('/api/v1/hr/leave-requests/:id', { preHandler: [authenticate, authorize('hr.edit')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const status = body.status as string | undefined;
    const managerNotes = body.managerNotes as string | undefined;
    const principal = ctx.principal;
    const scope = resolveHrScope(principal);
    const accessible = await applyScopePolicy('hr_leave', db('leave_requests').leftJoin('employees', 'leave_requests.employee_id', 'employees.id').where({ 'leave_requests.id': id, 'leave_requests.tenant_id': tenantId }), principal, scope).first();
    if (!accessible) throw new ForbiddenError('You do not have access to this leave request');
    await db('leave_requests').where({ id, tenant_id: tenantId }).update({ status: status || 'approved', manager_notes: managerNotes || null, approved_by: ctx.userId, approved_at: new Date(), updated_at: new Date() });

    await logAudit({ tenantId, userId: ctx.userId, action: 'hr.leave_approved', entityType: 'leave_request', entityId: id, metadata: { status }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Leave request updated');
  });

  app.get('/api/v1/hr/payroll', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const principal = getCtx(request).principal;
    const scope = resolveHrScope(principal);
    let runs = db('payroll_runs')
      .leftJoin('payroll_entries', 'payroll_runs.id', 'payroll_entries.payroll_run_id')
      .leftJoin('employees', 'payroll_entries.employee_id', 'employees.id')
      .where('payroll_runs.tenant_id', tenantId);
    runs = applyScopePolicy('hr_payroll', runs, principal, scope) as typeof runs;
    const result = await runs.select('payroll_runs.*').distinct('payroll_runs.id').orderBy('payroll_runs.created_at', 'desc').limit(20);
    return sendSuccess(reply, result);
  });
}
