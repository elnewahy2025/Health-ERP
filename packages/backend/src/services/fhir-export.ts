import { ValidationError } from '@healthcare/shared/errors';
import { db } from '../core/database.js';
import type { ExportFilters } from './export-service.js';

interface FhirResource {
  resourceType: string;
  id: string;
  [key: string]: unknown;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'collection';
  timestamp: string;
  total: number;
  entry: Array<{ fullUrl: string; resource: FhirResource }>;
}

const SUPPORTED_RESOURCE_TYPES = new Set([
  'Patient', 'Encounter', 'Appointment', 'Observation', 'MedicationRequest', 'MedicationDispense',
  'DiagnosticReport', 'Organization', 'Practitioner', 'Invoice', 'PaymentReconciliation',
]);

function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function asDate(value: unknown): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function reference(resourceType: string, id: unknown): { reference: string } | undefined {
  if (!id) return undefined;
  return { reference: `${resourceType}/${String(id)}` };
}

function fullUrl(resource: FhirResource): string {
  return `${resource.resourceType}/${resource.id}`;
}

function status(value: unknown, fallback: string): string {
  return value ? String(value) : fallback;
}

function createBundle(resources: FhirResource[]): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    total: resources.length,
    entry: resources.map((resource) => ({ fullUrl: fullUrl(resource), resource })),
  };
}

function patientWhere(query: any, tenantId: string, filters: ExportFilters, includeDeleted: boolean): any {
  query.where('tenant_id', tenantId);
  if (!includeDeleted) query.whereNull('deleted_at');
  if (filters.patientId) query.where('id', filters.patientId);
  if (filters.dateFrom) query.where('created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query.where('created_at', '<=', filters.dateTo);
  return query;
}

async function mapPatients(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  const query = patientWhere(db('patients'), tenantId, filters, includeDeleted);
  const rows = await query.select('id', 'medical_record_number', 'first_name', 'last_name', 'date_of_birth', 'gender', 'phone', 'email', 'address', 'status');
  return rows.map((row: any) => ({
    resourceType: 'Patient', id: String(row.id),
    identifier: [{ system: 'urn:health-erp:medical-record-number', value: row.medical_record_number }],
    name: [{ use: 'official', family: row.last_name, given: [row.first_name] }],
    gender: ['male', 'female', 'other', 'unknown'].includes(String(row.gender).toLowerCase()) ? String(row.gender).toLowerCase() : 'unknown',
    birthDate: row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : undefined,
    telecom: [row.phone ? { system: 'phone', value: row.phone, use: 'mobile' } : null, row.email ? { system: 'email', value: row.email } : null].filter(Boolean),
    address: row.address ? [{ ...((parseJson(row.address) as Record<string, unknown>) || {}) }] : undefined,
    active: String(row.status || 'active') === 'active',
  }));
}

async function mapOrganization(tenantId: string): Promise<FhirResource[]> {
  const tenant = await db('tenants').where({ id: tenantId }).select('id', 'name', 'slug', 'domain', 'status').first();
  if (!tenant) return [];
  return [{
    resourceType: 'Organization', id: String(tenant.id), name: tenant.name,
    identifier: [{ system: 'urn:health-erp:tenant-slug', value: tenant.slug }],
    telecom: tenant.domain ? [{ system: 'url', value: tenant.domain }] : undefined,
    active: String(tenant.status || 'active') === 'active',
  }];
}

async function mapPractitioners(tenantId: string): Promise<FhirResource[]> {
  const rows = await db('users').where({ tenant_id: tenantId }).whereNot('status', 'deleted').select('id', 'first_name', 'last_name', 'email', 'phone', 'status');
  return rows.map((row: any) => ({
    resourceType: 'Practitioner', id: String(row.id),
    name: [{ family: row.last_name, given: [row.first_name] }],
    telecom: [row.email ? { system: 'email', value: row.email } : null, row.phone ? { system: 'phone', value: row.phone } : null].filter(Boolean),
    active: String(row.status || 'active') === 'active',
  }));
}

async function mapAppointments(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let query = db('appointments').where({ tenant_id: tenantId }).select('id', 'patient_id', 'doctor_id', 'appointment_date', 'start_time', 'end_time', 'type', 'status', 'reason', 'is_virtual', 'created_at', 'deleted_at');
  if (!includeDeleted) query = query.whereNull('deleted_at');
  if (filters.patientId) query = query.where('patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('appointment_date', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('appointment_date', '<=', filters.dateTo);
  const rows = await query.orderBy('id');
  return rows.map((row: any) => ({
    resourceType: 'Appointment', id: String(row.id),
    status: ['proposed', 'pending', 'booked', 'arrived', 'fulfilled', 'cancelled', 'noshow', 'entered-in-error', 'checked-in', 'waitlist'].includes(String(row.status)) ? String(row.status) : 'pending',
    appointmentType: { text: row.type },
    description: row.reason || undefined,
    start: row.appointment_date && row.start_time ? `${String(row.appointment_date).slice(0, 10)}T${row.start_time}:00` : undefined,
    end: row.appointment_date && row.end_time ? `${String(row.appointment_date).slice(0, 10)}T${row.end_time}:00` : undefined,
    participant: [
      row.patient_id ? { actor: reference('Patient', row.patient_id), status: 'accepted' } : null,
      row.doctor_id ? { actor: reference('Practitioner', row.doctor_id), status: 'accepted' } : null,
    ].filter(Boolean),
    comment: row.is_virtual ? 'Virtual appointment' : undefined,
  }));
}

async function mapEncounters(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let query = db('emr_records').where({ tenant_id: tenantId }).select('id', 'patient_id', 'appointment_id', 'doctor_id', 'encounter_date', 'encounter_type', 'chief_complaint', 'diagnosis', 'status', 'deleted_at');
  if (!includeDeleted) query = query.whereNull('deleted_at');
  if (filters.patientId) query = query.where('patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('encounter_date', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('encounter_date', '<=', filters.dateTo);
  const rows = await query.orderBy('id');
  return rows.map((row: any) => {
    const diagnoses = parseJson(row.diagnosis);
    const diagnosisArray = Array.isArray(diagnoses) ? diagnoses : [];
    return {
      resourceType: 'Encounter', id: String(row.id),
      status: ['planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown'].includes(String(row.status)) ? String(row.status) : 'finished',
      class: { code: 'AMB', display: row.encounter_type || 'Ambulatory' },
      subject: reference('Patient', row.patient_id),
      participant: row.doctor_id ? [{ individual: reference('Practitioner', row.doctor_id) }] : undefined,
      appointment: row.appointment_id ? [reference('Appointment', row.appointment_id)] : undefined,
      period: { start: asDate(row.encounter_date) },
      reasonCode: row.chief_complaint ? [{ text: row.chief_complaint }] : undefined,
      diagnosis: diagnosisArray.map((item: any) => ({ condition: { display: typeof item === 'string' ? item : item?.description || item?.code || JSON.stringify(item) } })),
    };
  });
}

async function mapObservations(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let emrQuery = db('emr_records').where({ tenant_id: tenantId }).select('id', 'patient_id', 'encounter_date', 'vitals', 'deleted_at');
  if (!includeDeleted) emrQuery = emrQuery.whereNull('deleted_at');
  if (filters.patientId) emrQuery = emrQuery.where('patient_id', filters.patientId);
  if (filters.dateFrom) emrQuery = emrQuery.where('encounter_date', '>=', filters.dateFrom);
  if (filters.dateTo) emrQuery = emrQuery.where('encounter_date', '<=', filters.dateTo);
  const emrRows = await emrQuery;
  const resources: FhirResource[] = [];
  for (const row of emrRows as any[]) {
    const vitals = parseJson(row.vitals);
    if (!vitals || typeof vitals !== 'object' || Array.isArray(vitals)) continue;
    for (const [code, value] of Object.entries(vitals as Record<string, unknown>)) {
      const numeric = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
      resources.push({
        resourceType: 'Observation', id: `${String(row.id)}-${code}`.replace(/[^A-Za-z0-9\-.]/g, '-').slice(0, 64),
        status: 'final', code: { text: code }, subject: reference('Patient', row.patient_id),
        effectiveDateTime: asDate(row.encounter_date),
        ...(numeric ? { valueQuantity: { value: Number(value) } } : { valueString: String(value) }),
      });
    }
  }
  let labQuery = db('lab_tests').join('lab_orders', 'lab_orders.id', 'lab_tests.order_id').where('lab_orders.tenant_id', tenantId).select(
    'lab_tests.id', 'lab_tests.test_code', 'lab_tests.test_name', 'lab_tests.result_value', 'lab_tests.result_unit', 'lab_tests.status',
    'lab_orders.patient_id', 'lab_orders.order_date', 'lab_orders.deleted_at',
  );
  if (!includeDeleted) labQuery = labQuery.whereNull('lab_orders.deleted_at');
  if (filters.patientId) labQuery = labQuery.where('lab_orders.patient_id', filters.patientId);
  if (filters.dateFrom) labQuery = labQuery.where('lab_orders.order_date', '>=', filters.dateFrom);
  if (filters.dateTo) labQuery = labQuery.where('lab_orders.order_date', '<=', filters.dateTo);
  const labRows = await labQuery;
  for (const row of labRows as any[]) {
    if (row.result_value === null || row.result_value === undefined) continue;
    const numeric = Number.isFinite(Number(row.result_value));
    resources.push({
      resourceType: 'Observation', id: String(row.id), status: row.status === 'cancelled' ? 'cancelled' : 'final',
      code: { coding: [{ code: row.test_code }], text: row.test_name }, subject: reference('Patient', row.patient_id), effectiveDateTime: asDate(row.order_date),
      ...(numeric ? { valueQuantity: { value: Number(row.result_value), unit: row.result_unit || undefined } } : { valueString: String(row.result_value) }),
    });
  }
  return resources;
}

async function mapMedicationRequests(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let query = db('pharmacy_prescription_items').join('pharmacy_prescriptions', 'pharmacy_prescriptions.id', 'pharmacy_prescription_items.prescription_id')
    .where('pharmacy_prescriptions.tenant_id', tenantId).select('pharmacy_prescription_items.*', 'pharmacy_prescriptions.patient_id', 'pharmacy_prescriptions.doctor_id', 'pharmacy_prescriptions.status as prescription_status', 'pharmacy_prescriptions.deleted_at');
  if (!includeDeleted) query = query.whereNull('pharmacy_prescriptions.deleted_at');
  if (filters.patientId) query = query.where('pharmacy_prescriptions.patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('pharmacy_prescription_items.created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('pharmacy_prescription_items.created_at', '<=', filters.dateTo);
  const rows = await query.orderBy('pharmacy_prescription_items.id');
  return rows.map((row: any) => ({
    resourceType: 'MedicationRequest', id: String(row.id),
    status: ['active', 'on-hold', 'cancelled', 'completed', 'entered-in-error', 'stopped', 'draft', 'unknown'].includes(String(row.prescription_status)) ? String(row.prescription_status) : 'active',
    intent: 'order', medicationCodeableConcept: { text: row.drug_name }, subject: reference('Patient', row.patient_id), requester: reference('Practitioner', row.doctor_id),
    dosageInstruction: [{ text: [row.dosage, row.route, row.frequency, row.duration, row.instructions].filter(Boolean).join(' · ') }], dispenseRequest: { quantity: { value: row.quantity }, numberOfRepeatsAllowed: row.refills || 0 },
  }));
}

async function mapMedicationDispenses(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  if (!(await db.schema.hasTable('pharmacy_dispense_records'))) return [];
  let query = db('pharmacy_dispense_records').join('pharmacy_prescriptions', 'pharmacy_prescriptions.id', 'pharmacy_dispense_records.prescription_id')
    .join('pharmacy_prescription_items', 'pharmacy_prescription_items.id', 'pharmacy_dispense_records.prescription_item_id')
    .where('pharmacy_dispense_records.tenant_id', tenantId).select('pharmacy_dispense_records.*', 'pharmacy_prescriptions.patient_id', 'pharmacy_prescriptions.deleted_at', 'pharmacy_prescription_items.drug_name');
  if (!includeDeleted) query = query.whereNull('pharmacy_prescriptions.deleted_at');
  if (filters.patientId) query = query.where('pharmacy_prescriptions.patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('pharmacy_dispense_records.created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('pharmacy_dispense_records.created_at', '<=', filters.dateTo);
  const rows = await query.orderBy('pharmacy_dispense_records.id');
  return rows.map((row: any) => ({
    resourceType: 'MedicationDispense', id: String(row.id), status: 'completed', medicationCodeableConcept: { text: row.drug_name }, subject: reference('Patient', row.patient_id), performer: row.dispensed_by ? [{ actor: reference('Practitioner', row.dispensed_by) }] : undefined,
    quantity: { value: row.quantity }, whenHandedOver: asDate(row.created_at), authorizingPrescription: [reference('MedicationRequest', row.prescription_item_id)],
    batch: { lotNumber: row.batch_number || undefined, expirationDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : undefined },
  }));
}

async function mapDiagnosticReports(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let labQuery = db('lab_orders').where({ tenant_id: tenantId }).select('id', 'patient_id', 'order_number', 'status', 'order_date', 'results_summary', 'deleted_at');
  if (!includeDeleted) labQuery = labQuery.whereNull('deleted_at');
  if (filters.patientId) labQuery = labQuery.where('patient_id', filters.patientId);
  if (filters.dateFrom) labQuery = labQuery.where('order_date', '>=', filters.dateFrom);
  if (filters.dateTo) labQuery = labQuery.where('order_date', '<=', filters.dateTo);
  const labRows = await labQuery;
  let radiologyQuery = db('radiology_orders').where({ tenant_id: tenantId }).select('id', 'patient_id', 'order_number', 'study_type', 'status', 'order_date', 'impression', 'report', 'deleted_at');
  if (!includeDeleted) radiologyQuery = radiologyQuery.whereNull('deleted_at');
  if (filters.patientId) radiologyQuery = radiologyQuery.where('patient_id', filters.patientId);
  if (filters.dateFrom) radiologyQuery = radiologyQuery.where('order_date', '>=', filters.dateFrom);
  if (filters.dateTo) radiologyQuery = radiologyQuery.where('order_date', '<=', filters.dateTo);
  const radiologyRows = await radiologyQuery;
  return [...(labRows as any[]).map((row) => ({ resourceType: 'DiagnosticReport', id: String(row.id), status: row.status === 'cancelled' ? 'cancelled' : row.status === 'completed' ? 'final' : 'preliminary', code: { text: 'Laboratory report' }, subject: reference('Patient', row.patient_id), effectiveDateTime: asDate(row.order_date), conclusion: row.results_summary || undefined, identifier: [{ value: row.order_number }] })), ...(radiologyRows as any[]).map((row) => ({ resourceType: 'DiagnosticReport', id: String(row.id), status: row.status === 'cancelled' ? 'cancelled' : row.status === 'completed' || row.status === 'reviewed' ? 'final' : 'preliminary', code: { text: row.study_type }, subject: reference('Patient', row.patient_id), effectiveDateTime: asDate(row.order_date), conclusion: row.impression || row.report || undefined, identifier: [{ value: row.order_number }] }))];
}

async function mapInvoices(tenantId: string, filters: ExportFilters, includeDeleted: boolean): Promise<FhirResource[]> {
  let query = db('invoices').where({ tenant_id: tenantId }).select('id', 'patient_id', 'invoice_number', 'items', 'total', 'paid', 'due', 'status', 'issued_at', 'due_date', 'deleted_at');
  if (!includeDeleted) query = query.whereNull('deleted_at');
  if (filters.patientId) query = query.where('patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('issued_at', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('issued_at', '<=', filters.dateTo);
  const rows = await query;
  return rows.map((row: any) => ({ resourceType: 'Invoice', id: String(row.id), status: ['draft', 'issued', 'balanced', 'cancelled', 'disputed', 'paid', 'entered-in-error'].includes(String(row.status)) ? String(row.status) : 'issued', subject: reference('Patient', row.patient_id), date: asDate(row.issued_at), dueDate: row.due_date ? String(row.due_date).slice(0, 10) : undefined, identifier: [{ value: row.invoice_number }], totalNet: { value: Number(row.total || 0) }, totalGross: { value: Number(row.total || 0) }, paymentTerms: row.status === 'paid' ? 'Paid' : `Paid ${row.paid || 0}; due ${row.due || 0}`, lineItem: Array.isArray(parseJson(row.items)) ? (parseJson(row.items) as any[]).map((item) => ({ chargeItemReference: { display: item?.description || item?.name || JSON.stringify(item) } })) : undefined }));
}

async function mapPayments(tenantId: string, filters: ExportFilters): Promise<FhirResource[]> {
  let query = db('payment_transactions').join('invoices', 'invoices.id', 'payment_transactions.invoice_id').where('payment_transactions.tenant_id', tenantId).select('payment_transactions.id', 'payment_transactions.invoice_id', 'payment_transactions.amount', 'payment_transactions.method', 'payment_transactions.status', 'payment_transactions.created_at', 'invoices.patient_id');
  if (filters.patientId) query = query.where('invoices.patient_id', filters.patientId);
  if (filters.dateFrom) query = query.where('payment_transactions.created_at', '>=', filters.dateFrom);
  if (filters.dateTo) query = query.where('payment_transactions.created_at', '<=', filters.dateTo);
  const rows = await query;
  return rows.map((row: any) => ({ resourceType: 'PaymentReconciliation', id: String(row.id), status: row.status === 'completed' ? 'active' : 'cancelled', created: asDate(row.created_at), paymentIssuer: row.method ? { display: row.method } : undefined, detail: [{ request: reference('Invoice', row.invoice_id), amount: { value: Number(row.amount || 0) }, response: { identifier: [{ value: String(row.id) }] } }], note: row.patient_id ? [{ text: `Patient/${row.patient_id}` }] : undefined }));
}

export async function buildFhirBundle(tenantId: string, requestedType: string | undefined, filters: ExportFilters, includeDeleted: boolean): Promise<FhirBundle> {
  const normalizedType = requestedType ? `${requestedType.charAt(0).toUpperCase()}${requestedType.slice(1)}` : undefined;
  if (normalizedType && !SUPPORTED_RESOURCE_TYPES.has(normalizedType)) throw new ValidationError(`Unsupported FHIR resource type: ${requestedType}`);
  const resources: FhirResource[] = [];
  const include = (type: string): boolean => !normalizedType || normalizedType === type;
  if (include('Organization')) resources.push(...await mapOrganization(tenantId));
  if (include('Practitioner')) resources.push(...await mapPractitioners(tenantId));
  if (include('Patient')) resources.push(...await mapPatients(tenantId, filters, includeDeleted));
  if (include('Appointment')) resources.push(...await mapAppointments(tenantId, filters, includeDeleted));
  if (include('Encounter')) resources.push(...await mapEncounters(tenantId, filters, includeDeleted));
  if (include('Observation')) resources.push(...await mapObservations(tenantId, filters, includeDeleted));
  if (include('MedicationRequest')) resources.push(...await mapMedicationRequests(tenantId, filters, includeDeleted));
  if (include('MedicationDispense')) resources.push(...await mapMedicationDispenses(tenantId, filters, includeDeleted));
  if (include('DiagnosticReport')) resources.push(...await mapDiagnosticReports(tenantId, filters, includeDeleted));
  if (include('Invoice')) resources.push(...await mapInvoices(tenantId, filters, includeDeleted));
  if (include('PaymentReconciliation')) resources.push(...await mapPayments(tenantId, filters));
  return createBundle(resources);
}

export const FHIR_RESOURCE_TYPES = [...SUPPORTED_RESOURCE_TYPES];
