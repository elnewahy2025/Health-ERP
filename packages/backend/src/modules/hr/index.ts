import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';
import { logAudit } from '../../services/audit.js';

export async function registerHrModule(app: FastifyInstance) {
  app.get('/api/v1/hr/employees', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { department, status } = request.query as { department?: string; status?: string };
    let q = db('employees').where('employees.tenant_id', tenantId).whereNull('employees.deleted_at');
    if (department) q = q.andWhere('employees.department', department);
    if (status) q = q.andWhere('employees.status', status);
    const employees = await q.select('employees.*').orderBy('last_name');
    return sendSuccess(reply, employees);
  });

  app.post('/api/v1/hr/employees', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const empCode = "EMP-" + Date.now().toString(36).toUpperCase();
    const [emp] = await db('employees').insert({ tenant_id: tenantId, employee_code: body.employeeCode || empCode, first_name: body.firstName, last_name: body.lastName, email: body.email, phone: body.phone, department: body.department, position: body.position, employment_type: body.employmentType || 'full_time', hire_date: body.hireDate, base_salary: body.baseSalary || 0, pay_frequency: body.payFrequency || 'monthly', created_by: ctx.userId }).returning('*');

    await logAudit({ tenantId, userId: ctx.userId, action: 'hr.employee_created', entityType: 'employee', entityId: emp.id, metadata: { employeeCode: empCode, department: body.department }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, emp, 'Employee added', 201);
  });

  app.get('/api/v1/hr/attendance', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { date } = request.query as { date?: string };
    let q = db('attendance').where('attendance.tenant_id', tenantId);
    if (date) q = q.andWhereRaw("DATE(attendance.date) = ?", [date]);
    const records = await q.orderBy('date', 'desc').limit(100);
    return sendSuccess(reply, records);
  });

  app.get('/api/v1/hr/leave-requests', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { status } = request.query as { status?: string };
    let q = db('leave_requests').where('leave_requests.tenant_id', tenantId);
    if (status) q = q.andWhere('leave_requests.status', status);
    const requests = await q.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, requests);
  });

  app.post('/api/v1/hr/leave-requests', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const body = request.body as Record<string, unknown>;
    const start = new Date(String(body.startDate));
    const end = new Date(String(body.endDate));
    const days = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
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
    await db('leave_requests').where({ id, tenant_id: tenantId }).update({ status: status || 'approved', manager_notes: managerNotes || null, approved_by: ctx.userId, approved_at: new Date(), updated_at: new Date() });

    await logAudit({ tenantId, userId: ctx.userId, action: 'hr.leave_approved', entityType: 'leave_request', entityId: id, metadata: { status }, ipAddress: request.ip, userAgent: request.headers['user-agent'] as string });

    return sendSuccess(reply, null, 'Leave request updated');
  });

  app.get('/api/v1/hr/payroll', { preHandler: [authenticate, authorize('hr.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const runs = await db('payroll_runs').where({ tenant_id: tenantId }).orderBy('created_at', 'desc').limit(20);
    return sendSuccess(reply, runs);
  });
}
