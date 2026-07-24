import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import type { ImportJobRow } from "../types.js";

const IMPORT_MODULES: Record<string, { table: string; columns: string[] }> = {
  patients: {
    table: 'patients',
    columns: ['first_name', 'last_name', 'phone', 'email', 'date_of_birth', 'gender', 'national_id', 'address', 'blood_type', 'status']
  },
  appointments: {
    table: 'appointments',
    columns: ['patient_id', 'doctor_id', 'appointment_date', 'start_time', 'end_time', 'appointment_type', 'status', 'reason', 'branch_id']
  },
  inventory: {
    table: 'inventory_items',
    columns: ['warehouse_id', 'sku', 'name', 'category', 'unit', 'quantity', 'reorder_point', 'unit_cost', 'unit_price', 'manufacturer', 'supplier']
  },
  employees: {
    table: 'employees',
    columns: ['employee_code', 'first_name', 'last_name', 'email', 'phone', 'department', 'position', 'hire_date', 'employment_type', 'base_salary', 'status']
  },
};

export async function registerBulkImportModule(app: FastifyInstance) {
  // ── Available import modules ──
  app.get('/api/v1/import/modules', async (request, reply) => {
    return sendSuccess(reply, Object.entries(IMPORT_MODULES).map(([module, config]) => ({
      module, table: config.table, columns: config.columns,
    })));
  });

  // ── Start import job ──
  app.post('/api/v1/import/start', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const body = request.body as Record<string, unknown>;
    const { module, rows, columnMapping } = body;

    if (!module || !rows || !Array.isArray(rows) || rows.length === 0) {
      return reply.status(400).send({ success: false, error: 'Module and rows array required' });
    }

    const modConfig = IMPORT_MODULES[module as keyof typeof IMPORT_MODULES];
    if (!modConfig) return reply.status(400).send({ success: false, error: `Unknown module: ${module}` });

    const [job] = await db('import_jobs').insert({
      tenant_id: tenantId, module, file_name: body.fileName || `${module}_import.csv`,
      format: body.format || 'csv', status: 'processing', total_rows: rows.length,
      column_mapping: JSON.stringify(columnMapping || {}), raw_data: JSON.stringify(rows.slice(0, 5)),
      created_by: ctx.userId, started_at: new Date()
    }).returning('*');

    let successful = 0;
    let failed = 0;
    const errors: unknown[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const insertData: Record<string, unknown> = { tenant_id: tenantId };
        for (const col of modConfig.columns) {
          if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
            insertData[col] = row[col];
          }
        }
        // Set required fields
        if (module === 'patients' && !insertData.status) insertData.status = 'active';
        if (module === 'inventory' && insertData.quantity === undefined) insertData.quantity = 0;
        if (module === 'employees' && !insertData.employee_code) insertData.employee_code = `IMP-${Date.now()}-${i}`;

        await db(modConfig.table).insert(insertData);
        successful++;
      } catch (err: unknown) {
        failed++;
        errors.push({ row: i + 1, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const status = failed === 0 ? 'completed' : successful > 0 ? 'completed' : 'failed';
    await db('import_jobs').where({ id: job.id }).update({
      status, successful_rows: successful, failed_rows: failed,
      errors: JSON.stringify(errors.slice(0, 100)), completed_at: new Date()
    });

    return sendSuccess(reply, {
      id: job.id, module, totalRows: rows.length,
      successful, failed, errors: errors.slice(0, 10),
      status
    }, `Import ${status}`, 201);
  });

  // ── Import job history ──
  app.get('/api/v1/import/jobs', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const { status, module } = request.query as { module?: string; status?: string };
    let q = db('import_jobs').where('import_jobs.tenant_id', tenantId);
    if (status) q = q.andWhere('status', status);
    if (module) q = q.andWhere('module', module);
    const jobs = await q.orderBy('created_at', 'desc').limit(50);
    return sendSuccess(reply, jobs.map((j: Record<string, unknown>) => ({
      id: j.id, module: j.module, fileName: j.file_name, format: j.format,
      status: j.status, totalRows: j.total_rows, successfulRows: j.successful_rows,
      failedRows: j.failed_rows, errors: (j.errors as unknown[] | undefined)?.slice(0, 5),
      startedAt: j.started_at, completedAt: j.completed_at, createdAt: j.created_at
    })));
  });

  // ── Import template (column list for each module) ──
  app.get('/api/v1/import/template/:module', async (request, reply) => {
    const { module } = request.params as { module: string };
    const config = IMPORT_MODULES[module as keyof typeof IMPORT_MODULES];
    if (!config) return reply.status(404).send({ success: false, error: `Unknown module: ${module}` });
    return sendSuccess(reply, {
      module, table: config.table, columns: config.columns,
      sample: Object.fromEntries(config.columns.map((c: string) => [c, `[${c.replace(/_/g, ' ')}]`])),
      required: config.columns.filter(c => !c.includes('optional'))
    });
  });
}
