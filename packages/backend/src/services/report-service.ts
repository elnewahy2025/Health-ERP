import type { Knex } from 'knex';
import { ConflictError, ForbiddenError, ValidationError } from '@healthcare/shared/errors';
import { permissionKeyMatches, type PermissionScope } from '@healthcare/shared/authz';
import { db } from '../core/database.js';
import { applyScopePolicy } from './scope-policy.js';
import { scopeCovers, type Principal } from './authorization.js';
import { logAudit } from './audit.js';
import { formatDocumentDate, getPdfMake, loadClinicDocumentContext } from './pdf.js';
import {
  deleteEncryptedArtifact,
  readEncryptedArtifact,
  writeEncryptedArtifact,
} from './export-service.js';

export type ReportFormat = 'csv' | 'pdf' | 'excel' | 'json';

export interface ReportDefinitionRecord {
  id: string;
  tenant_id: string;
  name: string;
  slug?: string;
  category: string;
  query_config: unknown;
  columns: unknown;
  filters: unknown;
  sorting: unknown;
  export_formats: unknown;
  branch_id?: string | null;
  department_id?: string | null;
}

export interface ReportExecutionRecord {
  id: string;
  tenant_id: string;
  report_id: string;
  status: string;
  format: ReportFormat;
  error: string | null;
  output_path: string | null;
  row_count: number;
  trigger: string;
  created_by: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  params: unknown;
  scope_context: unknown;
  storage_location: string | null;
  checksum: string | null;
  file_size: number | null;
  mime_type: string | null;
  file_name: string | null;
  retention_days: number;
  artifact_expires_at: Date | null;
  artifact_deleted_at: Date | null;
}

interface ReportSource {
  key: string;
  table: string;
  policy: string;
  dateColumn: string;
  columns: string[];
  joins: Array<{ table: string; left: string; right: string }>;
  patientColumn?: string;
  branchColumn?: string;
}

interface ReportColumn {
  header: string;
  accessor: string;
}

interface ReportFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

interface ReportSort {
  field: string;
  direction?: string;
}

interface ScopeSnapshot {
  scope: PermissionScope;
  branches: string[];
  departmentId: string | null;
  userId: string;
}

const REPORT_WORKER_INTERVAL_MS = 60_000;
const STALE_REPORT_MINUTES = 60;
const DEFAULT_REPORT_RETENTION_DAYS = 7;
const MAX_REPORT_ROWS = Math.max(1, Math.min(1_000_000, Number(process.env.REPORT_MAX_ROWS || 100_000)));

const REPORT_SOURCES: Record<string, ReportSource> = {
  patients: {
    key: 'patients', table: 'patients', policy: 'patients', dateColumn: 'created_at', patientColumn: 'patients.id', branchColumn: 'patients.branch_id',
    columns: ['id', 'medical_record_number', 'first_name', 'last_name', 'date_of_birth', 'gender', 'status', 'branch_id', 'created_at', 'updated_at'], joins: [],
  },
  appointments: {
    key: 'appointments', table: 'appointments', policy: 'appointments', dateColumn: 'appointment_date', patientColumn: 'appointments.patient_id', branchColumn: 'appointments.branch_id',
    columns: ['id', 'patient_id', 'doctor_id', 'branch_id', 'appointment_date', 'start_time', 'end_time', 'type', 'status', 'reason', 'is_virtual', 'created_at'], joins: [],
  },
  emr: {
    key: 'emr', table: 'emr_records', policy: 'emr', dateColumn: 'encounter_date', patientColumn: 'emr_records.patient_id', branchColumn: 'patients.branch_id',
    columns: ['id', 'patient_id', 'appointment_id', 'doctor_id', 'encounter_date', 'encounter_type', 'chief_complaint', 'diagnosis', 'procedures', 'medications', 'vitals', 'status', 'created_at'],
    joins: [{ table: 'patients', left: 'emr_records.patient_id', right: 'patients.id' }],
  },
  billing: {
    key: 'billing', table: 'invoices', policy: 'billing', dateColumn: 'issued_at', patientColumn: 'invoices.patient_id', branchColumn: 'patients.branch_id',
    columns: ['id', 'patient_id', 'appointment_id', 'invoice_number', 'total', 'paid', 'due', 'status', 'due_date', 'issued_at', 'paid_at', 'created_at'],
    joins: [{ table: 'patients', left: 'invoices.patient_id', right: 'patients.id' }],
  },
  laboratory: {
    key: 'laboratory', table: 'lab_orders', policy: 'laboratory', dateColumn: 'order_date', patientColumn: 'lab_orders.patient_id', branchColumn: 'patients.branch_id',
    columns: ['id', 'patient_id', 'doctor_id', 'appointment_id', 'order_number', 'status', 'priority', 'order_date', 'collected_at', 'completed_at', 'results_summary', 'created_at'],
    joins: [{ table: 'patients', left: 'lab_orders.patient_id', right: 'patients.id' }],
  },
  radiology: {
    key: 'radiology', table: 'radiology_orders', policy: 'radiology', dateColumn: 'order_date', patientColumn: 'radiology_orders.patient_id', branchColumn: 'patients.branch_id',
    columns: ['id', 'patient_id', 'doctor_id', 'appointment_id', 'order_number', 'study_type', 'body_part', 'status', 'priority', 'order_date', 'scheduled_date', 'created_at'],
    joins: [{ table: 'patients', left: 'radiology_orders.patient_id', right: 'patients.id' }],
  },
  pharmacy: {
    key: 'pharmacy', table: 'pharmacy_prescriptions', policy: 'pharmacy', dateColumn: 'created_at', patientColumn: 'pharmacy_prescriptions.patient_id', branchColumn: 'patients.branch_id',
    columns: ['id', 'patient_id', 'doctor_id', 'prescription_number', 'status', 'created_at', 'updated_at'],
    joins: [{ table: 'patients', left: 'pharmacy_prescriptions.patient_id', right: 'patients.id' }],
  },
  inventory: {
    key: 'inventory', table: 'inventory_items', policy: 'inventory', dateColumn: 'created_at', branchColumn: 'warehouses.branch_id',
    columns: ['id', 'warehouse_id', 'sku', 'name', 'category', 'unit', 'quantity', 'reorder_point', 'unit_price', 'batch_number', 'expiry_date', 'status', 'created_at'],
    joins: [{ table: 'warehouses', left: 'inventory_items.warehouse_id', right: 'warehouses.id' }],
  },
  hr: {
    key: 'hr', table: 'employees', policy: 'hr', dateColumn: 'hire_date', branchColumn: 'employees.branch_id',
    columns: ['id', 'employee_code', 'first_name', 'last_name', 'department_id', 'position', 'employment_type', 'hire_date', 'termination_date', 'status', 'created_at'], joins: [],
  },
};

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function parseReportFormat(value: unknown): ReportFormat {
  const normalized = String(value || 'csv').toLowerCase();
  if (!['csv', 'pdf', 'excel', 'json'].includes(normalized)) throw new ValidationError('Report format must be csv, pdf, excel, or json');
  return normalized as ReportFormat;
}

function getSource(report: ReportDefinitionRecord): ReportSource {
  const queryConfig = parseJson<Record<string, unknown>>(report.query_config, {});
  const key = String(queryConfig.table || queryConfig.source || '').trim().toLowerCase();
  const source = REPORT_SOURCES[key];
  if (!source) throw new ValidationError('Report definition must specify a supported queryConfig.table source', { supportedSources: Object.keys(REPORT_SOURCES) });
  return source;
}

function parseRetentionDays(value: unknown): number {
  const days = Number(value || DEFAULT_REPORT_RETENTION_DAYS);
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ValidationError('Report retentionDays must be between 1 and 3650');
  return days;
}

function parseScope(value: unknown): PermissionScope {
  const scope = String(value || 'tenant') as PermissionScope;
  return ['self', 'assigned_patients', 'department', 'branch', 'branches', 'tenant', 'system'].includes(scope) ? scope : 'tenant';
}

function reportColumns(report: ReportDefinitionRecord, source: ReportSource, params: Record<string, unknown>): ReportColumn[] {
  const raw = params.columns ?? report.columns;
  const parsed = parseJson<unknown[]>(raw, []);
  if (!Array.isArray(parsed)) throw new ValidationError('Report columns must be an array');
  const columns = parsed.length === 0
    ? source.columns.map((accessor) => ({ header: accessor.replaceAll('_', ' '), accessor }))
    : parsed.map((item) => {
      if (typeof item === 'string') return { header: item, accessor: item };
      const record = item as Record<string, unknown>;
      return { header: String(record.header || record.accessor || ''), accessor: String(record.accessor || '') };
    });
  const valid = new Set(source.columns);
  const invalid = columns.filter((column) => !column.accessor || !valid.has(column.accessor));
  if (invalid.length > 0) throw new ValidationError('Report contains unsupported columns', { columns: invalid.map((column) => column.accessor) });
  const duplicate = new Set<string>();
  for (const column of columns) {
    if (duplicate.has(column.accessor)) throw new ValidationError('Report contains duplicate columns', { column: column.accessor });
    duplicate.add(column.accessor);
  }
  return columns;
}

function reportFilters(report: ReportDefinitionRecord, params: Record<string, unknown>): ReportFilter[] {
  const definitionFilters = parseJson<unknown[]>(report.filters, []);
  const requestFilters = parseJson<unknown[]>(params.filters, []);
  const raw = [...definitionFilters, ...requestFilters];
  if (!raw.every((value) => value && typeof value === 'object' && !Array.isArray(value))) throw new ValidationError('Report filters must be objects');
  return raw.map((value) => {
    const record = value as Record<string, unknown>;
    const field = String(record.field || record.accessor || '').trim();
    if (!field) throw new ValidationError('Report filter field is required');
    return { field, operator: String(record.operator || 'eq').toLowerCase(), value: record.value };
  });
}

function reportSorting(report: ReportDefinitionRecord, params: Record<string, unknown>): ReportSort[] {
  const raw = parseJson<unknown[]>(params.sorting ?? report.sorting, []);
  if (!Array.isArray(raw)) throw new ValidationError('Report sorting must be an array');
  return raw.map((value) => {
    const record = value as Record<string, unknown>;
    return { field: String(record.field || record.accessor || ''), direction: String(record.direction || 'asc').toLowerCase() };
  });
}

function sourceQuery(source: ReportSource): Knex.QueryBuilder {
  let query = db(source.table);
  for (const join of source.joins) query = query.leftJoin(join.table, join.left, join.right);
  return query;
}

function applyFilter(query: Knex.QueryBuilder, source: ReportSource, filter: ReportFilter): void {
  if (!source.columns.includes(filter.field)) throw new ValidationError('Report filter references an unsupported field', { field: filter.field });
  const field = `${source.table}.${filter.field}`;
  const operator = filter.operator || 'eq';
  if (operator === 'eq') query.where(field, filter.value as any);
  else if (operator === 'neq') query.whereNot(field, filter.value as any);
  else if (operator === 'contains') query.whereILike(field, `%${String(filter.value ?? '').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
  else if (['gt', 'gte', 'lt', 'lte'].includes(operator)) query.where(field, operator === 'gt' ? '>' : operator === 'gte' ? '>=' : operator === 'lt' ? '<' : '<=', filter.value as any);
  else if (operator === 'in') {
    if (!Array.isArray(filter.value) || filter.value.length > 100) throw new ValidationError('Report IN filters require an array of at most 100 values');
    query.whereIn(field, filter.value as any[]);
  } else if (operator === 'between') {
    if (!Array.isArray(filter.value) || filter.value.length !== 2) throw new ValidationError('Report BETWEEN filters require exactly two values');
    query.whereBetween(field, filter.value as [any, any]);
  } else throw new ValidationError(`Unsupported report filter operator: ${operator}`);
}

function applyRequestedScopeFilters(query: Knex.QueryBuilder, source: ReportSource, params: Record<string, unknown>, report: ReportDefinitionRecord): void {
  const dateFrom = params.dateFrom ? String(params.dateFrom) : undefined;
  const dateTo = params.dateTo ? String(params.dateTo) : undefined;
  if (dateFrom && !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) throw new ValidationError('dateFrom must use YYYY-MM-DD');
  if (dateTo && !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) throw new ValidationError('dateTo must use YYYY-MM-DD');
  if (dateFrom && dateTo && dateFrom > dateTo) throw new ValidationError('dateFrom cannot be after dateTo');
  if (dateFrom) query.where(`${source.table}.${source.dateColumn}`, '>=', dateFrom);
  if (dateTo) query.where(`${source.table}.${source.dateColumn}`, '<=', dateTo);
  const patientId = params.patientId ? String(params.patientId) : undefined;
  if (patientId && source.patientColumn) query.where(source.patientColumn, patientId);
  const branchId = params.branchId ? String(params.branchId) : report.branch_id;
  if (branchId && source.branchColumn) query.where(source.branchColumn, branchId);
  if (report.department_id) {
    if (source.policy === 'hr') query.where(`${source.table}.department_id`, report.department_id);
    else query.whereExists(function reportDepartmentFilter() {
      this.select(1).from('appointments as report_scope_appointments')
        .join('users as report_scope_doctors', 'report_scope_appointments.doctor_id', 'report_scope_doctors.id')
        .whereRaw('report_scope_appointments.patient_id = ??', [source.patientColumn || `${source.table}.patient_id`])
        .andWhere('report_scope_appointments.tenant_id', report.tenant_id)
        .andWhere('report_scope_doctors.department_id', report.department_id as string);
    });
  }
}

function applyFiltersAndSorting(query: Knex.QueryBuilder, source: ReportSource, report: ReportDefinitionRecord, params: Record<string, unknown>, columns: ReportColumn[]): Knex.QueryBuilder {
  const allowed = new Set(columns.map((column) => column.accessor));
  for (const filter of reportFilters(report, params)) {
    if (!allowed.has(filter.field)) throw new ValidationError('Report filters must use selected report columns', { field: filter.field });
    applyFilter(query, source, filter);
  }
  applyRequestedScopeFilters(query, source, params, report);
  for (const sort of reportSorting(report, params)) {
    if (!allowed.has(sort.field)) throw new ValidationError('Report sorting must use selected report columns', { field: sort.field });
    if (!['asc', 'desc'].includes(sort.direction || '')) throw new ValidationError('Report sorting direction must be asc or desc');
    query.orderBy(`${source.table}.${sort.field}`, sort.direction as 'asc' | 'desc');
  }
  if (reportSorting(report, params).length === 0) query.orderBy(`${source.table}.id`, 'asc');
  return query.limit(MAX_REPORT_ROWS + 1);
}

function scopeSnapshot(value: unknown, fallbackUserId: string): ScopeSnapshot {
  const raw = parseJson<Record<string, unknown>>(value, {});
  const branches = Array.isArray(raw.branches) ? raw.branches.map(String).filter(Boolean) : [];
  return { scope: parseScope(raw.scope), branches, departmentId: raw.departmentId ? String(raw.departmentId) : null, userId: String(raw.userId || fallbackUserId) };
}

function workerPrincipal(execution: ReportExecutionRecord): Principal {
  const snapshot = scopeSnapshot(execution.scope_context, execution.created_by || 'report-worker');
  return { kind: 'user', id: snapshot.userId, tenantId: execution.tenant_id, roles: [], grants: [], denials: [], branches: snapshot.branches, departmentId: snapshot.departmentId, locale: 'en', permVersion: 0, status: 'active' };
}

function xmlEscape(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function csvEscape(value: unknown): string {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeRows(rows: Array<Record<string, unknown>>, columns: ReportColumn[]): Array<Record<string, unknown>> {
  return rows.map((row) => Object.fromEntries(columns.map((column) => [column.accessor, row[column.accessor]])));
}

function renderCsv(report: ReportDefinitionRecord, columns: ReportColumn[], rows: Array<Record<string, unknown>>): Buffer {
  const lines = [columns.map((column) => csvEscape(column.header)).join(','), ...rows.map((row) => columns.map((column) => csvEscape(row[column.accessor])).join(','))];
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

function renderJson(report: ReportDefinitionRecord, columns: ReportColumn[], rows: Array<Record<string, unknown>>): Buffer {
  return Buffer.from(`${JSON.stringify({ report: report.name, reportId: report.id, generatedAt: new Date().toISOString(), columns, rows }, null, 2)}\n`, 'utf8');
}

function renderExcel(report: ReportDefinitionRecord, columns: ReportColumn[], rows: Array<Record<string, unknown>>): Buffer {
  const rowsXml = [
    `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xmlEscape(column.header)}</Data></Cell>`).join('')}</Row>`,
    ...rows.map((row) => `<Row>${columns.map((column) => `<Cell><Data ss:Type="String">${xmlEscape(typeof row[column.accessor] === 'object' ? JSON.stringify(row[column.accessor]) : row[column.accessor])}</Data></Cell>`).join('')}</Row>`),
  ].join('');
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${xmlEscape(report.name.slice(0, 31))}"><Table>${rowsXml}</Table></Worksheet></Workbook>`;
  return Buffer.from(xml, 'utf8');
}

async function renderPdf(report: ReportDefinitionRecord, columns: ReportColumn[], rows: Array<Record<string, unknown>>, tenantId: string, snapshot: ScopeSnapshot): Promise<Buffer> {
  const pm = await getPdfMake();
  const clinic = await loadClinicDocumentContext(tenantId, { branchId: snapshot.branches.length === 1 ? snapshot.branches[0] : undefined, departmentId: snapshot.departmentId || undefined });
  const tableRows = [
    columns.map((column) => ({ text: column.header, style: 'tableHeader' })),
    ...rows.map((row) => columns.map((column) => typeof row[column.accessor] === 'object' ? JSON.stringify(row[column.accessor]) : String(row[column.accessor] ?? ''))),
  ];
  const content: any[] = [
    { text: clinic.displayName, style: 'title' },
    { text: report.name, style: 'subtitle' },
    { text: [clinic.address, clinic.phone, clinic.email].filter(Boolean).join('  | '), fontSize: 8, color: 'gray' },
    { text: `Generated: ${formatDocumentDate(new Date(), clinic.timezone, clinic.locale)}`, fontSize: 8, color: 'gray', margin: [0, 4, 0, 10] },
    { table: { headerRows: 1, widths: columns.map(() => '*'), body: tableRows }, layout: 'lightHorizontalLines' },
  ];
  return new Promise((resolve, reject) => {
    try {
      pm.createPdf({ content, pageOrientation: columns.length > 6 ? 'landscape' : 'portrait', pageMargins: [24, 24, 24, 24], defaultStyle: { fontSize: 8, font: 'Roboto' }, styles: { title: { fontSize: 16, bold: true, color: '#2563eb' }, subtitle: { fontSize: 12, bold: true, margin: [0, 3, 0, 3] }, tableHeader: { bold: true, fontSize: 8, color: 'white', fillColor: '#2563eb', margin: [3, 3] } } }).getBuffer((buffer: Buffer) => resolve(buffer));
    } catch (error) { reject(error); }
  });
}

function outputMetadata(format: ReportFormat): { extension: string; mimeType: string } {
  if (format === 'csv') return { extension: 'csv', mimeType: 'text/csv; charset=utf-8' };
  if (format === 'pdf') return { extension: 'pdf', mimeType: 'application/pdf' };
  if (format === 'excel') return { extension: 'xls', mimeType: 'application/vnd.ms-excel; charset=utf-8' };
  return { extension: 'json', mimeType: 'application/json; charset=utf-8' };
}

async function buildReportOutput(report: ReportDefinitionRecord, execution: ReportExecutionRecord): Promise<{ buffer: Buffer; rowCount: number; extension: string; mimeType: string; fileName: string }> {
  const params = parseJson<Record<string, unknown>>(execution.params, {});
  const source = getSource(report);
  const columns = reportColumns(report, source, params);
  const principal = workerPrincipal(execution);
  let query = sourceQuery(source);
  query = applyScopePolicy(source.policy, query, principal, scopeSnapshot(execution.scope_context, execution.created_by || '').scope) as typeof query;
  query = applyFiltersAndSorting(query, source, report, params, columns);
  const rawRows = await query.select(columns.map((column) => `${source.table}.${column.accessor} as ${column.accessor}`));
  if (rawRows.length > MAX_REPORT_ROWS) throw new ValidationError(`Report exceeds the maximum of ${MAX_REPORT_ROWS.toLocaleString()} rows`);
  const rows = normalizeRows(rawRows as Array<Record<string, unknown>>, columns);
  const format = parseReportFormat(execution.format);
  const metadata = outputMetadata(format);
  const snapshot = scopeSnapshot(execution.scope_context, execution.created_by || '');
  const buffer = format === 'csv' ? renderCsv(report, columns, rows) : format === 'json' ? renderJson(report, columns, rows) : format === 'excel' ? renderExcel(report, columns, rows) : await renderPdf(report, columns, rows, execution.tenant_id, snapshot);
  return { buffer, rowCount: rows.length, ...metadata, fileName: `health-erp-report-${report.slug || report.id}-${execution.id}.${metadata.extension}` };
}

function reportStorageLocation(): string {
  return process.env.REPORT_STORAGE_LOCATION || process.env.EXPORT_STORAGE_LOCATION || 'local://reports';
}

export function getReportSources(): Array<{ source: string; table: string; columns: string[]; formats: ReportFormat[] }> {
  return Object.values(REPORT_SOURCES).map((source) => ({ source: source.key, table: source.table, columns: source.columns, formats: ['csv', 'pdf', 'excel', 'json'] }));
}

export function validateReportFormatAllowed(report: ReportDefinitionRecord, format: unknown): ReportFormat {
  const parsed = parseReportFormat(format);
  const allowed = parseJson<unknown[]>(report.export_formats, ['csv', 'pdf', 'excel']).map(String);
  if (!allowed.includes(parsed)) throw new ValidationError(`Report format ${parsed} is not enabled for this definition`);
  return parsed;
}

export function validateReportDefinitionForExecution(report: ReportDefinitionRecord, format: unknown, params: Record<string, unknown>): ReportFormat {
  const parsed = validateReportFormatAllowed(report, format);
  const source = getSource(report);
  const columns = reportColumns(report, source, params);
  reportFilters(report, params);
  reportSorting(report, params).forEach((sort) => {
    if (!source.columns.includes(sort.field)) throw new ValidationError('Report sorting references an unsupported field', { field: sort.field });
  });
  applyRequestedScopeFilters(db(source.table), source, params, report);
  return parsed;
}

export async function processReportExecution(execution: ReportExecutionRecord): Promise<void> {
  const report = await db('report_definitions').where({ id: execution.report_id, tenant_id: execution.tenant_id }).first() as ReportDefinitionRecord | undefined;
  if (!report) throw new ConflictError('Report definition no longer exists');
  const output = await buildReportOutput(report, execution);
  const artifact = await writeEncryptedArtifact({ storageLocation: reportStorageLocation(), tenantId: execution.tenant_id, artifactId: execution.id, extension: output.extension, plaintext: output.buffer, mimeType: output.mimeType });
  try {
    await db('report_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'completed', output_path: artifact.filePath, storage_location: artifact.storageLocation, checksum: artifact.checksum, file_size: artifact.fileSize, mime_type: output.mimeType, file_name: output.fileName, row_count: output.rowCount, completed_at: new Date(), updated_at: new Date(), artifact_expires_at: new Date(Date.now() + parseRetentionDays(execution.retention_days) * 86_400_000), error: null });
    await logAudit({ tenantId: execution.tenant_id, userId: execution.created_by || undefined, action: 'report.completed', entityType: 'report_execution', entityId: execution.id, metadata: { reportId: execution.report_id, format: execution.format, rowCount: output.rowCount, fileSize: artifact.fileSize } });
  } catch (error) {
    await deleteEncryptedArtifact(artifact.storageLocation, artifact.filePath).catch(() => {});
    throw error;
  }
}

async function claimNextReport(): Promise<ReportExecutionRecord | null> {
  return db.transaction(async (trx) => {
    const execution = await trx('report_executions').where({ status: 'pending' }).orderBy('created_at', 'asc').forUpdate().skipLocked().first();
    if (!execution) return null;
    await trx('report_executions').where({ id: execution.id, status: 'pending' }).update({ status: 'processing', started_at: new Date(), updated_at: new Date(), error: null });
    return { ...execution, status: 'processing' } as ReportExecutionRecord;
  });
}

async function recoverStaleReports(): Promise<void> {
  await db('report_executions').where({ status: 'processing' }).where('started_at', '<', new Date(Date.now() - STALE_REPORT_MINUTES * 60_000)).update({ status: 'pending', started_at: null, updated_at: new Date(), error: 'Recovered after report worker interruption' });
}

export async function applyReportRetention(now = new Date()): Promise<void> {
  const jobs = await db('report_executions').where({ status: 'completed' }).whereNotNull('artifact_expires_at').where('artifact_expires_at', '<', now).whereNull('artifact_deleted_at').whereNotNull('output_path');
  for (const execution of jobs as ReportExecutionRecord[]) {
    try {
      if (execution.storage_location && execution.output_path) await deleteEncryptedArtifact(execution.storage_location, execution.output_path);
      await db('report_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ artifact_deleted_at: now, output_path: null, checksum: null, file_size: null, mime_type: null, file_name: null, updated_at: now });
      await logAudit({ tenantId: execution.tenant_id, userId: execution.created_by || undefined, action: 'report.artifact_deleted', entityType: 'report_execution', entityId: execution.id, metadata: { reason: 'retention_expired' } });
    } catch (error) {
      await db('report_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ error: error instanceof Error ? error.message : 'Report retention cleanup failed', updated_at: now });
    }
  }
}

let workerInterval: NodeJS.Timeout | null = null;
let workerRunning = false;

export async function processPendingReportsOnce(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await recoverStaleReports();
    const execution = await claimNextReport();
    if (execution) {
      try {
        await processReportExecution(execution);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Report execution failed';
        await db('report_executions').where({ id: execution.id, tenant_id: execution.tenant_id }).update({ status: 'failed', error: message, completed_at: new Date(), updated_at: new Date(), output_path: null, checksum: null, file_size: null, mime_type: null, file_name: null });
        await logAudit({ tenantId: execution.tenant_id, userId: execution.created_by || undefined, action: 'report.failed', entityType: 'report_execution', entityId: execution.id, metadata: { reportId: execution.report_id, error: message }, result: 'failed' });
      }
    }
    await applyReportRetention();
  } finally {
    workerRunning = false;
  }
}

export function startReportWorker(): void {
  if (workerInterval) return;
  processPendingReportsOnce().catch((error) => console.error('Report worker error:', error));
  workerInterval = setInterval(() => processPendingReportsOnce().catch((error) => console.error('Report worker error:', error)), REPORT_WORKER_INTERVAL_MS);
  workerInterval.unref();
}

export function stopReportWorker(): void {
  if (!workerInterval) return;
  clearInterval(workerInterval);
  workerInterval = null;
}

export function canAccessReportExecution(execution: ReportExecutionRecord, principal: Principal, currentScope: PermissionScope): boolean {
  const snapshot = scopeSnapshot(execution.scope_context, execution.created_by || '');
  if (!scopeCovers(currentScope, snapshot.scope)) return false;
  if (currentScope === 'system' || currentScope === 'tenant') return true;
  if (snapshot.scope === 'branch' || snapshot.scope === 'branches') return snapshot.branches.length > 0 && principal.branches.some((branch) => snapshot.branches.includes(branch));
  if (snapshot.scope === 'department') return Boolean(snapshot.departmentId && principal.departmentId === snapshot.departmentId);
  if (snapshot.scope === 'assigned_patients' || snapshot.scope === 'self') return principal.id === snapshot.userId;
  return false;
}

export function assertReportExecutionPermission(execution: ReportExecutionRecord, principal: Principal, permission = 'reports.download'): void {
  const currentScope = principal.grants.find((grant) => grant.permission === '*' || permissionKeyMatches(grant.permission, permission))?.scope || 'self';
  if (!canAccessReportExecution(execution, principal, currentScope)) throw new ForbiddenError('Report artifact is outside your authorized execution scope');
}

export async function readReportArtifact(execution: ReportExecutionRecord): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
  if (execution.status !== 'completed' || !execution.output_path || execution.artifact_deleted_at) throw new ConflictError('Report artifact is not ready');
  if (execution.artifact_expires_at && new Date(execution.artifact_expires_at).getTime() <= Date.now()) throw new ConflictError('Report artifact has expired');
  if (!execution.storage_location) throw new ConflictError('Report artifact storage is not configured');
  const buffer = await readEncryptedArtifact({ storageLocation: execution.storage_location, filePath: execution.output_path, checksum: execution.checksum });
  return { buffer, mimeType: execution.mime_type || 'application/octet-stream', fileName: execution.file_name || `report-${execution.id}` };
}
