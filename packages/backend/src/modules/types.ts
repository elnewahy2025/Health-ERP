// ============================================
// Database Row Types
// Based on migration schemas 001-021
// ============================================

// ── Core Tables ──

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  locale: string;
  timezone: string;
  settings: Record<string, unknown>;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface RoleRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  permissions: unknown[];
  is_system: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  first_name: string;
  last_name: string;
  role_id: string | null;
  roles: unknown[];
  permissions: unknown[];
  locale: string;
  status: string;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  branch_id: string | null;
  last_login_at: Date | null;
  password_changed_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface BranchRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  address: unknown;
  phone: string;
  email: string | null;
  status: string;
  timezone: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Patient Tables ──

export interface PatientRow {
  id: string;
  tenant_id: string;
  medical_record_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  nationality: string | null;
  blood_type: string | null;
  email: string | null;
  phone: string;
  phone2: string | null;
  address: unknown;
  emergency_contact: unknown;
  insurance: unknown;
  allergies: unknown;
  medical_history: unknown;
  marital_status: string | null;
  occupation: string | null;
  preferred_language: string;
  profile_image: string | null;
  status: string;
  tags: unknown[];
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  national_id?: string;
  age?: number;
}

export interface PatientAllergyRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  allergen: string;
  severity: string;
  reaction: string | null;
  onset_date: string | null;
  status: string;
  created_at: Date;
}

export interface PatientMedicationRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: Date;
}

// ── Appointment Table ──

export interface AppointmentRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  branch_id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration: number;
  type: string;
  status: string;
  reason: string | null;
  notes: string | null;
  is_virtual: boolean;
  is_walk_in: boolean;
  telemedicine_link: string | null;
  reminder_sent: boolean;
  reminders: unknown;
  check_in_time: Date | null;
  check_out_time: Date | null;
  cancel_reason: string | null;
  cancelled_at: Date | null;
  rescheduled_from: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  patient_first_name?: string;
  patient_last_name?: string;
  doctor_first_name?: string;
  doctor_last_name?: string;
}

// ── EMR Tables ──

export interface EmrRecordRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string;
  encounter_date: string;
  encounter_type: string;
  chief_complaint: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  diagnosis: unknown[];
  procedures: unknown[];
  medications: unknown[];
  lab_orders: unknown[];
  radiology_orders: unknown[];
  vitals: unknown | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  patient_first_name?: string;
  patient_last_name?: string;
  medical_record_number?: string;
}

// ── Billing Tables ──

export interface InvoiceRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  invoice_number: string;
  items: unknown;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  due: number;
  status: string;
  payment_method: string | null;
  insurance_claim: string | null;
  notes: string | null;
  due_date: string;
  issued_at: Date;
  paid_at: Date | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  patient_first_name?: string;
  patient_last_name?: string;
  medical_record_number?: string;
}

export interface PaymentTransactionRow {
  id: string;
  tenant_id: string;
  invoice_id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  status: string;
  created_at: Date;
}

// ── Audit Tables ──

export interface AuditLogRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  entity_type?: string;
  changes: unknown | null;
  ip: string | null;
  ip_address?: string;
  user_agent: string | null;
  metadata?: unknown;
  timestamp: Date;
  created_at?: Date;
}

// ── Laboratory Tables ──

export interface LabOrderRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  emr_record_id: string | null;
  order_number: string;
  status: string;
  priority: string;
  order_date: string;
  collected_at: Date | null;
  completed_at: Date | null;
  clinical_notes: string | null;
  results_summary: string | null;
  results: unknown[];
  collected_by: string | null;
  reviewed_by: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  p_first?: string;
  p_last?: string;
  medical_record_number?: string;
}

export interface LabTestRow {
  id: string;
  order_id: string;
  test_code: string;
  test_name: string;
  specimen_type: string | null;
  result_value: string | null;
  result_unit: string | null;
  reference_range: string | null;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface LabCatalogRow {
  id: string;
  tenant_id: string;
  test_code: string;
  test_name: string;
  category: string | null;
  specimen_type: string | null;
  reference_range: string | null;
  unit: string | null;
  price: number;
  is_active: boolean;
  created_at: Date;
}

// ── Radiology Table ──

export interface RadiologyOrderRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  order_number: string;
  study_type: string;
  body_part: string | null;
  status: string;
  priority: string;
  order_date: string;
  scheduled_date: string | null;
  clinical_indication: string | null;
  findings: string | null;
  impression: string | null;
  report: string | null;
  dicom_link: string | null;
  technician_id: string | null;
  radiologist_id: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Pharmacy Tables ──

export interface PharmacyInventoryRow {
  id: string;
  tenant_id: string;
  drug_name: string;
  generic_name: string;
  brand_name: string | null;
  dosage_form: string;
  strength: string;
  stock_quantity: number;
  reorder_level: number;
  unit_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  manufacturer: string | null;
  requires_prescription: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface PharmacyPrescriptionRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  emr_record_id: string | null;
  prescription_number: string;
  notes: string | null;
  status: string;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined
  p_first?: string;
  p_last?: string;
}

export interface PharmacyPrescriptionItemRow {
  id: string;
  prescription_id: string;
  drug_name: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string | null;
  quantity: number;
  quantity_dispensed: number;
  refills: number;
  instructions: string | null;
  status: string;
  created_at: Date;
}

// ── Queue Table ──

export interface QueueEntryRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  department: string;
  priority: number;
  status: string;
  check_in_time: Date;
  called_at: Date | null;
  completed_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Referral Table ──

export interface ReferralRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  from_doctor_id: string;
  to_doctor_id: string;
  appointment_id: string | null;
  reason: string;
  notes: string | null;
  status: string;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Notification Tables ──

export interface NotificationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  channel: string;
  is_read: boolean;
  metadata: unknown | null;
  created_at: Date;
}

export interface NotificationTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: unknown[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── Nursing Tables ──

export interface NursingNoteRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  nurse_id: string;
  observation: string | null;
  intervention: string | null;
  response: string | null;
  plan: string | null;
  vitals: unknown | null;
  shift: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface NursingTaskRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  nurse_id: string;
  title: string;
  description: string | null;
  due_time: string | null;
  status: string;
  priority: string;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Home Visits Table ──

export interface HomeVisitRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  assigned_to: string;
  created_by: string | null;
  visit_number: string;
  status: string;
  visit_type: string;
  scheduled_date: string;
  scheduled_time: string | null;
  address: string;
  notes: string | null;
  clinical_notes: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  latitude: number | null;
  longitude: number | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Telemedicine Table ──

export interface TelemedicineSessionRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string | null;
  session_id: string;
  room_name: string;
  status: string;
  provider: string;
  meeting_link: string | null;
  started_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number;
  recording_enabled: boolean;
  recording_url: string | null;
  notes: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Insurance Tables ──

export interface InsuranceCompanyRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  contract_type: string;
  discount_rate: number;
  coverage_plans: unknown[];
  is_active: boolean;
  created_at: Date;
}

export interface InsuranceClaimRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  invoice_id: string | null;
  insurance_id: string;
  claim_number: string;
  status: string;
  claimed_amount: number;
  approved_amount: number;
  paid_amount: number;
  submission_date: string | null;
  response_date: string | null;
  notes: string | null;
  denial_reason: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Inventory Tables ──

export interface WarehouseRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  type: string;
  address: unknown | null;
  phone: string | null;
  status: string;
  created_at: Date;
}

export interface InventoryItemRow {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  quantity: number;
  reorder_point: number;
  unit_cost: number;
  unit_price: number;
  batch_number: string | null;
  expiry_date: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  supplier: string | null;
  description: string | null;
  status: string;
  last_restocked_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined
  wh_name?: string;
}

export interface InventoryTransactionRow {
  id: string;
  tenant_id: string;
  item_id: string;
  type: string;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: Date;
}

export interface PurchaseOrderRow {
  id: string;
  tenant_id: string;
  warehouse_id: string;
  po_number: string;
  supplier: string;
  status: string;
  total_amount: number;
  order_date: string;
  expected_date: string | null;
  received_date: string | null;
  notes: string | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseOrderItemRow {
  id: string;
  po_id: string;
  item_id: string | null;
  item_name: string;
  sku: string | null;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  total_cost: number;
  created_at: Date;
}

// ── HR Tables ──

export interface EmployeeRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  employee_number: string;
  first_name: string;
  last_name: string;
  department: string;
  position: string;
  hire_date: string;
  salary: number;
  status: string;
  phone: string | null;
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttendanceRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  notes: string | null;
  created_at: Date;
}

export interface LeaveRequestRow {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  approved_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollRunRow {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_amount: number;
  processed_by: string | null;
  processed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollEntryRow {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  employee_id: string;
  base_salary: number;
  bonuses: number;
  deductions: number;
  net_pay: number;
  notes: string | null;
  created_at: Date;
}

// ── Document Tables ──

export interface DocumentRow {
  id: string;
  tenant_id: string;
  name: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  folder: string;
  tags: unknown[];
  uploaded_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentVersionRow {
  id: string;
  document_id: string;
  version: number;
  file_url: string;
  file_size: number;
  uploaded_by: string | null;
  notes: string | null;
  created_at: Date;
}

// ── CRM Tables ──

export interface CrmCampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  target_audience: unknown;
  content: string | null;
  scheduled_at: Date | null;
  sent_at: Date | null;
  sent_count: number;
  open_count: number;
  click_count: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CrmPatientFeedbackRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  rating: number;
  comment: string | null;
  category: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

// ── Forms Tables ──

export interface FormDefinitionRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  schema: unknown;
  category: string;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FormSubmissionRow {
  id: string;
  tenant_id: string;
  form_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  data: unknown;
  status: string;
  submitted_by: string | null;
  submitted_at: Date;
  created_at: Date;
}

// ── Workflow Tables ──

export interface WorkflowDefinitionRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  steps: unknown[];
  triggers: unknown[];
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkflowInstanceRow {
  id: string;
  tenant_id: string;
  definition_id: string;
  reference_id: string | null;
  reference_type: string | null;
  current_step: number;
  status: string;
  assigned_to: string | null;
  context: unknown;
  created_at: Date;
  completed_at: Date | null;
  updated_at: Date;
}

// ── Compliance Tables ──

export interface CompliancePolicyRow {
  id: string;
  tenant_id: string;
  title: string;
  code: string;
  category: string | null;
  description: string | null;
  content: string | null;
  status: string;
  effective_date: string | null;
  review_date: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ComplianceAuditRow {
  id: string;
  tenant_id: string;
  title: string;
  type: string;
  status: string;
  scheduled_date: string | null;
  completed_date: string | null;
  scope: string | null;
  findings: string | null;
  recommendations: string | null;
  auditor: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BreachLogRow {
  id: string;
  tenant_id: string;
  type: string;
  detected_date: string;
  reported_date: string | null;
  severity: string;
  description: string;
  affected_data: string | null;
  affected_records: number;
  action_taken: string | null;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface DataConsentLogRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  consent_type: string;
  granted: boolean;
  details: string | null;
  ip_address: string | null;
  consented_at: Date;
}

// ── AI Tables ──

export interface AiClinicalNoteRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string;
  note_type: string;
  raw_notes: string;
  generated_note: string;
  summary: string | null;
  structured_data: unknown;
  status: string;
  doctor_corrections: string | null;
  ai_model_used: string;
  created_at: Date;
  updated_at: Date;
}

export interface AiDiagnosisSuggestionRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string;
  symptoms: string;
  suggestions: unknown;
  selected_code: string | null;
  was_accepted: boolean | null;
  doctor_feedback: string | null;
  ai_model_used: string;
  response_time_ms: number | null;
  created_at: Date;
}

export interface AiPredictionRow {
  id: string;
  tenant_id: string;
  prediction_type: string;
  related_type: string | null;
  related_id: string | null;
  features: unknown;
  result: unknown;
  confidence: number;
  prediction_date: string;
  target_date: string | null;
  was_accurate: boolean | null;
  created_at: Date;
}

export interface AiSmartScheduleRow {
  id: string;
  tenant_id: string;
  schedule_date: string;
  optimized_slots: unknown;
  constraints: unknown;
  expected_revenue: number | null;
  expected_utilization: number | null;
  is_applied: boolean;
  applied_at: Date | null;
  created_at: Date;
}

export interface PatientRiskScoreRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  risk_type: string;
  score: number;
  factors: unknown;
  model_version: string | null;
  calculated_at: Date;
  expires_at: Date | null;
}

export interface AiProviderRow {
  id: string;
  tenant_id: string;
  name: string;
  provider: string;
  api_endpoint: string | null;
  api_key_encrypted: string | null;
  config: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AiModelRow {
  id: string;
  tenant_id: string;
  provider_id: string;
  model_name: string;
  display_name: string;
  capabilities: unknown;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  max_tokens: number;
  is_active: boolean;
  created_at: Date;
}

export interface AiAssistantRow {
  id: string;
  tenant_id: string;
  model_id: string;
  name: string;
  slug: string;
  category: string;
  system_prompt: string;
  tools: unknown;
  config: unknown;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AiRequestRow {
  id: string;
  tenant_id: string;
  assistant_id: string | null;
  model_id: string | null;
  user_id: string | null;
  prompt: string;
  response: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  status: string;
  error: string | null;
  source: string | null;
  created_at: Date;
}

export interface AiCostLogRow {
  id: string;
  tenant_id: string;
  date: string;
  source: string | null;
  total_tokens: number;
  total_requests: number;
  total_cost: number;
  created_at: Date;
}

// ── Automation Tables ──

export interface AutomationRuleRow {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  trigger_type: string;
  trigger_event: string | null;
  trigger_config: unknown;
  conditions: unknown;
  is_active: boolean;
  priority: number;
  max_executions: number;
  cooldown_minutes: number;
  execution_count: number;
  last_executed_at: Date | null;
  last_triggered_at: Date | null;
  action_type?: string;
  action_config?: unknown;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AutomationRuleActionRow {
  id: string;
  rule_id: string;
  step_order: number;
  action_type: string;
  action_name: string;
  action_config: unknown;
  condition_override: unknown | null;
  is_active: boolean;
  created_at: Date;
}

export interface AutomationExecutionLogRow {
  id: string;
  tenant_id: string;
  rule_id: string;
  rule_name?: string;
  trigger_type: string;
  reference_type: string | null;
  reference_id: string | null;
  status: string;
  input_data: unknown;
  output_data: unknown;
  error_message: string | null;
  duration_ms: number | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

export interface AutomationLogRow {
  id: string;
  tenant_id: string;
  rule_id: string;
  event: string;
  status: string;
  result: unknown;
  error: string | null;
  created_at: Date;
}

// ── Barcode Tables ──

export interface BarcodeTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  category: string;
  format: string;
  symbology: string;
  fields: unknown;
  label_template: string | null;
  label_config: unknown;
  include_human_readable: boolean;
  is_active: boolean;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface BarcodeLabelRow {
  id: string;
  tenant_id: string;
  template_id: string;
  reference_id: string;
  reference_type: string;
  barcode_data: string;
  barcode_image_url: string | null;
  format: string;
  status: string;
  print_count: number;
  printed_at: Date | null;
  expires_at: Date | null;
  created_by: string | null;
  created_at: Date;
}

export interface BarcodeRegistryRow {
  id: string;
  tenant_id: string;
  code: string;
  type: string;
  entity_type: string;
  entity_id: string;
  label: string | null;
  payload: unknown;
  created_at: Date;
}

export interface BarcodeScanLogRow {
  id: string;
  tenant_id: string;
  label_id: string | null;
  barcode_data: string;
  action: string;
  scanned_by: string | null;
  scanner_id: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  metadata: unknown;
  scanned_at: Date;
}

// ── BI / Analytics Tables ──

export interface DwAppointmentStatsRow {
  id: string;
  tenant_id: string;
  date: string;
  department: string | null;
  doctor_id: string | null;
  total_appointments: number;
  completed: number;
  cancelled: number;
  no_show: number;
  average_wait_minutes: number;
}

export interface DwRevenueStatsRow {
  id: string;
  tenant_id: string;
  date: string;
  department: string | null;
  total_revenue: number;
  insurance_revenue: number;
  cash_revenue: number;
  outstanding_amount: number;
  average_invoice_value: number;
  invoice_count: number;
}

export interface DwPatientStatsRow {
  id: string;
  tenant_id: string;
  date: string;
  new_patients: number;
  returning_patients: number;
  total_active: number;
  average_age: number | null;
  gender_distribution: unknown;
}

// ── Data Export Tables ──

export interface ExportDefinitionRow {
  id: string;
  tenant_id: string;
  name: string;
  entity_type: string;
  format: string;
  columns: unknown[];
  filters: unknown;
  is_scheduled: boolean;
  schedule: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Dashboard Widgets Table ──

export interface DashboardWidgetRow {
  id: string;
  tenant_id: string;
  user_id: string;
  widget_type: string;
  title: string;
  config: unknown;
  position: number;
  size: string;
  is_visible: boolean;
  refresh_interval: number;
  created_at: Date;
  updated_at: Date;
}

// ── System Tables ──

export interface SystemMetricRow {
  id: string;
  tenant_id: string;
  metric: string;
  value: number;
  labels: unknown;
  recorded_at: Date;
}

export interface SystemAlertRow {
  id: string;
  tenant_id: string;
  severity: string;
  source: string;
  message: string;
  metadata: unknown;
  is_acknowledged: boolean;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  created_at: Date;
}

// ── Patient Messaging Table ──

export interface PatientMessageRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  sender_id: string;
  subject: string | null;
  body: string;
  channel: string;
  is_read: boolean;
  parent_id: string | null;
  attachments: unknown;
  created_at: Date;
  updated_at: Date;
}

// ── Portal Session Table ──

export interface PortalSessionRow {
  id: string;
  patient_id: string;
  token: string;
  otp: string | null;
  otp_expires_at: Date | null;
  ip_address: string | null;
  user_agent: string | null;
  last_activity_at: Date;
  expires_at: Date;
  created_at: Date;
}

// ── Patient Shared Documents Table ──

export interface PatientSharedDocumentRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  document_id: string | null;
  title: string;
  file_name: string;
  file_type: string | null;
  storage_path: string;
  category: string;
  notes: string | null;
  shared_at: Date;
  is_acknowledged: boolean;
  acknowledged_at: Date | null;
}

// ── Patient Portal Messages (subset of patient_messages) ──

export interface PortalMessageRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  sender_id: string | null;
  direction: string;
  subject: string;
  body: string;
  is_read: boolean;
  read_at: Date | null;
  attachment_id: string | null;
  created_at: Date;
}

// ── Online Booking Tables ──

export interface BookingSlotRow {
  id: string;
  tenant_id: string;
  doctor_id: string;
  branch_id: string;
  date: string;
  start_time: string;
  end_time: string;
  slot_type: string;
  is_available: boolean;
  created_at: Date;
}

export interface BookingRequestRow {
  id: string;
  tenant_id: string;
  slot_id: string;
  patient_id: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  patient_email: string | null;
  reason: string | null;
  notes: string | null;
  source: string;
  status: string;
  confirmed_at: Date | null;
  confirmed_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Integration Tables ──

export interface IntegrationConnectionRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  provider: string;
  config: unknown;
  credentials: unknown;
  status: string;
  last_sync_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Webhook Table ──

export interface WebhookRow {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: unknown[];
  headers: unknown;
  secret: string | null;
  is_active: boolean;
  status: string;
  retry_count: number;
  timeout_seconds: number;
  integration_id: string | null;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── API Keys Table ──

export interface ApiKeyRow {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions: unknown;
  rate_limit: number;
  allowed_ips: unknown;
  is_active: boolean;
  last_used_at: Date | null;
  expires_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Session & Auth Tables ──

export interface UserSessionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  device: string | null;
  ip_address: string | null;
  user_agent: string | null;
  location: string | null;
  is_active: boolean;
  last_activity_at: Date | null;
  expires_at: Date;
  created_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  tenant_id: string;
  user_id: string;
  token_hash: string;
  family: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface UserSettingRow {
  id: string;
  tenant_id: string;
  user_id: string;
  theme: string | null;
  timezone: string | null;
  date_format: string | null;
  time_format: string | null;
  items_per_page: number;
  dashboard_config: unknown;
  shortcuts: unknown;
  quick_search_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── Reports Table ──

export interface ReportExecutionRow {
  id: string;
  tenant_id: string;
  report_id: string;
  status: string;
  format: 'csv' | 'pdf' | 'excel' | 'json';
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
  updated_at: Date | null;
}

// ── Backup Tables ──

export interface BackupConfigRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  schedule: string;
  storage_location: string;
  retention_days: number;
  include_schemas: unknown;
  exclude_tables: unknown;
  encryption_key_ref: string | null;
  is_active: boolean;
  last_backup_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface BackupExecutionRow {
  id: string;
  tenant_id: string;
  config_id: string;
  type: string;
  trigger: string;
  status: string;
  file_path: string | null;
  size_bytes: number | null;
  checksum: string | null;
  error: string | null;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

// ── Subscription Tables ──

export interface SubscriptionPlanRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: unknown;
  limits: unknown;
  modules: unknown;
  max_users: number;
  max_branches: number;
  max_storage_gb: number;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface TenantSubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  amount: number;
  billing_cycle: string;
  payment_provider: string | null;
  payment_provider_id: string | null;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancelled_at: Date | null;
  addons: unknown;
  discounts: unknown;
  created_at: Date;
  updated_at: Date;
}

// ── Tenant Branding Table ──

export interface TenantBrandingRow {
  id: string;
  tenant_id: string;
  brand_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_family: string | null;
  custom_css: string | null;
  custom_js: string | null;
  login_page: string | null;
  email_templates: unknown;
  created_at: Date;
  updated_at: Date;
}

// ── Tenant Domain Table ──

export interface TenantDomainRow {
  id: string;
  tenant_id: string;
  domain: string;
  is_primary: boolean;
  is_verified: boolean;
  ssl_status: string;
  verification_token: string | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Multi-branch ──

export interface BackupExecutionRow2 {
  id: string;
  tenant_id: string;
  config_id: string;
  type: string;
  status: string;
  file_path: string | null;
  size_bytes: number | null;
  checksum: string | null;
  error: string | null;
  trigger: string;
  started_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

// ── Kiosk & Surveys ──

export interface KioskCheckinRow {
  id: string;
  tenant_id: string;
  patient_id: string;
  appointment_id: string | null;
  queue_number: number;
  national_id_input: string;
  status: string;
  called_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SurveyRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  type: string;
  questions: unknown[];
  estimated_minutes: number;
  is_active: boolean;
  auto_send: boolean;
  created_at: Date;
}

export interface SurveyResponseRow {
  id: string;
  tenant_id: string;
  survey_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  checkin_id: string | null;
  responses: unknown;
  overall_score: number | null;
  patient_comment: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  staff_notes: string | null;
  submitted_at: Date;
  created_at: Date;
}

// ── Clinical ──

export interface MedicationDatabaseRow {
  id: string;
  name: string;
  generic_name: string;
  category: string;
  dosage_forms: unknown;
  contraindications: unknown;
  side_effects: unknown;
  interactions: unknown;
  created_at: Date;
}

export interface Icd10CodeRow {
  id: string;
  code: string;
  description: string;
  category: string;
  is_chronic: boolean;
}

// ── WhatsApp / Voice / Chat ──

export interface WhatsAppMessageRow {
  id: string;
  tenant_id: string;
  patient_id: string | null;
  to_number: string;
  from_number: string | null;
  direction: string;
  message_type: string;
  message: string | null;
  template_name: string | null;
  template_params: unknown;
  status: string;
  external_id: string | null;
  external_message_id: string | null;
  metadata: unknown;
  sent_at: Date | null;
  delivered_at: Date | null;
  read_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

export interface WhatsAppTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  language: string;
  category: string;
  body_text: string;
  variables: unknown;
  status: string;
  is_active: boolean;
  created_at: Date;
}

export interface VoiceCallRow {
  id: string;
  tenant_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  initiated_by: string | null;
  from_number: string;
  to_number: string;
  call_type: string;
  status: string;
  external_call_sid: string | null;
  duration_seconds: number;
  ringing_seconds: number;
  answered_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  recording_urls: unknown;
  error_message: string | null;
  notes: string | null;
  created_at: Date;
}

export interface ChatConversationRow {
  id: string;
  tenant_id: string;
  type: string;
  name: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatParticipantRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: Date;
  last_read_at: Date | null;
}

// ── Communication (Advanced) ──

export interface VoiceCallRow2 {
  id: string;
  tenant_id: string;
  from_number: string;
  to_number: string;
  call_type: string;
  status: string;
  duration_seconds: number;
  initiated_by: string | null;
  patient_id: string | null;
  appointment_id: string | null;
  external_call_sid: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  answered_at: Date | null;
  ringing_seconds: number;
  recording_urls: unknown;
  error_message: string | null;
  notes: string | null;
  created_at: Date;
}

// ── Expense / Financial ──

export interface ExpenseCategoryRow {
  id: string;
  tenant_id: string | null;
  name: string;
  code: string;
  type: string;
  description: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface ExpenseRow {
  id: string;
  tenant_id: string;
  title: string;
  amount: number;
  category_id: string | null;
  branch_id: string | null;
  expense_date: string;
  description: string | null;
  payment_method: string;
  vendor_name: string | null;
  vendor_tax_id: string | null;
  tax_type: string | null;
  tax_amount: number;
  status: string;
  approved_by: string | null;
  approved_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  // Joined
  category_name?: string;
  category_code?: string;
}

// ── Import Jobs ──

export interface ImportJobRow {
  id: string;
  tenant_id: string;
  entity_type: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  errors: unknown;
  created_by: string | null;
  created_at: Date;
  completed_at: Date | null;
}

// ── User Settings / Preferences ──

export interface NotificationPreferenceRow {
  id: string;
  tenant_id: string;
  user_id: string;
  channel: string;
  event_type: string;
  is_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── Tenant Data Residency ──

export interface TenantDataResidencyRow {
  id: string;
  tenant_id: string;
  primary_region_id: string | null;
  backup_region_id: string | null;
  data_classifications: unknown;
  compliance_framework: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Patient Scheduling ──

export interface AppointmentReminderRow {
  id: string;
  tenant_id: string;
  appointment_id: string;
  channel: string;
  scheduled_at: Date;
  sent_at: Date | null;
  status: string;
  error: string | null;
  created_at: Date;
}

// ── Usage Records ──

export interface UsageRecordRow {
  id: string;
  tenant_id: string;
  subscription_id: string;
  metric: string;
  quantity: number;
  record_date: string;
  created_at: Date;
}

// ── API Key Logs ──

export interface ApiKeyLogRow {
  id: string;
  tenant_id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  ip: string;
  response_status: number;
  created_at: Date;
}

// ── Webhook Logs ──

export interface WebhookLogRow {
  id: string;
  tenant_id: string;
  webhook_id: string;
  event: string;
  status: string;
  request_body: unknown;
  response_body: unknown;
  response_status: number | null;
  error: string | null;
  attempt: number;
  created_at: Date;
}

// ── Telemedicine extras ──

export interface TelemedicineChatMessageRow {
  id: string;
  session_id: string;
  sender_id: string;
  sender_type: string;
  message: string;
  message_type: string;
  file_url: string | null;
  created_at: Date;
}

export interface TelemedicineWaitingRoomRow {
  id: string;
  session_id: string;
  participant_id: string;
  participant_type: string;
  status: string;
  joined_at: Date;
  admitted_at: Date | null;
  left_at: Date | null;
}

// ── Report Row ──

export interface ReportRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  status: string;
  params: unknown;
  result: unknown;
  file_url: string | null;
  format: string | null;
  generated_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportScheduleRow {
  id: string;
  tenant_id: string;
  report_id: string;
  frequency: string;
  next_run: Date;
  recipients: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// Request Type Interfaces
// ============================================

// ── Common ──

export interface PaginationQuery {
  page?: number;
  limit?: number;
  order?: string;
  search?: string;
}

export interface IdParams {
  id: string;
}

export interface IdQuery {
  id?: string;
}

// ── Patient Request Types ──

export interface PatientListQuery extends PaginationQuery {
  status?: string;
  gender?: string;
  search?: string;
  nationality?: string;
}

export interface PatientParams {
  patientId: string;
}

// ── Appointment Request Types ──

export interface AppointmentListQuery extends PaginationQuery {
  status?: string;
  doctorId?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
  type?: string;
}

export interface AppointmentParams {
  appointmentId: string;
}

// ── EMR Request Types ──

export interface EmrListQuery extends PaginationQuery {
  patientId?: string;
  doctorId?: string;
  status?: string;
}

export interface EmrParams {
  emrId: string;
}

// ── Billing Request Types ──

export interface InvoiceListQuery extends PaginationQuery {
  status?: string;
  patientId?: string;
  startDate?: string;
  endDate?: string;
}

export interface InvoiceParams {
  invoiceId: string;
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
  description?: string;
  category?: string;
}

export interface CreateInvoiceBody {
  patientId: string;
  appointmentId?: string;
  items: InvoiceItem[];
  discount: number;
  tax: number;
  dueDate: string;
  notes?: string;
  paymentMethod?: string;
}

export interface PaymentBody {
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
}

// ── Lab Request Types ──

export interface LabOrderListQuery {
  status?: string;
  patientId?: string;
}

export interface LabOrderParams {
  id: string;
}

export interface LabCatalogBody {
  testCode: string;
  testName: string;
  category?: string;
  specimenType?: string;
  referenceRange?: string;
  unit?: string;
  price?: number;
}

export interface CreateLabOrderBody {
  patientId: string;
  appointmentId?: string;
  priority?: string;
  clinicalNotes?: string;
  tests?: LabTestItem[];
}

export interface LabTestItem {
  testCode?: string;
  code?: string;
  testName?: string;
  name?: string;
  specimenType?: string;
  referenceRange?: string;
  unit?: string;
}

export interface LabTestResultItem {
  id: string;
  resultValue?: string;
  status?: string;
  notes?: string;
}

export interface LabResultsBody {
  tests?: LabTestResultItem[];
}

export interface LabStatusBody {
  status: string;
  resultsSummary?: string;
}

// ── Radiology Request Types ──

export interface RadiologyBody {
  patientId: string;
  appointmentId?: string;
  studyType: string;
  bodyPart?: string;
  priority?: string;
  clinicalIndication?: string;
}

export interface RadiologyParams {
  id: string;
}

export interface RadiologyStatusBody {
  status: string;
  findings?: string;
  impression?: string;
  report?: string;
  dicomLink?: string;
}

// ── Pharmacy Request Types ──

export interface PharmacyInventoryQuery {
  search?: string;
  status?: string;
}

export interface PharmacyInventoryBody {
  drugName: string;
  genericName: string;
  brandName?: string;
  dosageForm: string;
  strength: string;
  stockQuantity?: number;
  reorderLevel?: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  manufacturer?: string;
  requiresPrescription?: boolean;
}

export interface PharmacyStockBody {
  quantity: number;
}

export interface PharmacyPrescriptionQuery {
  status?: string;
  patientId?: string;
}

export interface PharmacyPrescriptionBody {
  patientId: string;
  emrRecordId?: string;
  notes?: string;
  items?: PharmacyPrescriptionItemBody[];
}

export interface PharmacyPrescriptionItemBody {
  drugName: string;
  dosage: string;
  route?: string;
  frequency: string;
  duration?: string;
  quantity?: number;
  refills?: number;
  instructions?: string;
}

export interface PharmacyIdParams {
  id: string;
}

export interface PharmacyDispenseBody {
  items?: PharmacyDispenseItem[];
}

export interface PharmacyDispenseItem {
  id: string;
  drugName?: string;
  quantityDispensed?: number;
  status?: string;
}

// ── Queue Request Types ──

export interface QueueBody {
  patientId: string;
  department: string;
  priority?: number;
  notes?: string;
}

export interface QueueStatusBody {
  status: string;
}

// ── Referral Request Types ──

export interface ReferralBody {
  patientId: string;
  toDoctorId: string;
  reason: string;
  notes?: string;
}

export interface ReferralStatusBody {
  status: string;
}

// ── Nursing Request Types ──

export interface NursingNoteBody {
  patientId: string;
  appointmentId?: string;
  observation?: string;
  intervention?: string;
  response?: string;
  plan?: string;
  vitals?: Record<string, unknown>;
  shift?: string;
}

export interface NursingStatusBody {
  status: string;
}

export interface NursingTaskBody {
  patientId: string;
  title: string;
  description?: string;
  dueTime?: string;
  priority?: string;
}

// ── Home Visit Request Types ──

export interface HomeVisitBody {
  patientId: string;
  visitType?: string;
  scheduledDate: string;
  scheduledTime?: string;
  address: string;
  notes?: string;
}

export interface HomeVisitStatusBody {
  status: string;
  clinicalNotes?: string;
  latitude?: number;
  longitude?: number;
}

// ── Telemedicine Request Types ──

export interface TelemedicineBody {
  patientId: string;
  appointmentId?: string;
  provider?: string;
  notes?: string;
}

export interface TelemedicineStatusBody {
  status: string;
  notes?: string;
}

// ── Insurance Request Types ──

export interface InsuranceBody {
  patientId: string;
  invoiceId?: string;
  insuranceCompanyId: string;
  claimedAmount: number;
  notes?: string;
}

export interface InsuranceClaimStatusBody {
  status: string;
  approvedAmount?: number;
  paidAmount?: number;
  denialReason?: string;
}

// ── Inventory Request Types ──

export interface InventoryQuery {
  category?: string;
  warehouseId?: string;
  search?: string;
}

export interface WarehouseBody {
  name: string;
  code: string;
  type?: string;
}

export interface InventoryItemBody {
  warehouseId?: string;
  sku: string;
  name: string;
  category?: string;
  unit?: string;
  quantity?: number;
  reorderPoint?: number;
  unitCost?: number;
  unitPrice?: number;
  batchNumber?: string;
  expiryDate?: string;
  serialNumber?: string;
  manufacturer?: string;
  supplier?: string;
  description?: string;
}

export interface StockUpdateBody {
  quantity: number;
  type?: string;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
}

export interface PurchaseOrderQuery {
  status?: string;
}

export interface PurchaseOrderBody {
  warehouseId?: string;
  supplier?: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  items?: PurchaseOrderItemBody[];
}

export interface PurchaseOrderItemBody {
  itemId?: string;
  itemName: string;
  sku?: string;
  quantityOrdered: number;
  unitCost?: number;
}

export interface ReceiveOrderBody {
  items?: ReceiveOrderItem[];
}

export interface ReceiveOrderItem {
  id: string;
  quantityReceived: number;
}

// ── HR Request Types ──

export interface EmployeeBody {
  firstName: string;
  lastName: string;
  department: string;
  position: string;
  hireDate: string;
  salary: number;
  phone?: string;
  email?: string;
}

export interface AttendanceBody {
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  status?: string;
  notes?: string;
}

export interface LeaveRequestBody {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface PayrollRunBody {
  periodStart: string;
  periodEnd: string;
}

export interface PayrollEntryBody {
  employeeId: string;
  baseSalary: number;
  bonuses?: number;
  deductions?: number;
  notes?: string;
}

// ── Document Request Types ──

export interface DocumentBody {
  name: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  folder?: string;
  tags?: string[];
}

// ── CRM Request Types ──

export interface CrmCampaignBody {
  name: string;
  type: string;
  targetAudience?: unknown;
  content?: string;
  scheduledAt?: string;
}

export interface CrmFeedbackBody {
  patientId: string;
  appointmentId?: string;
  rating: number;
  comment?: string;
  category?: string;
}

// ── Forms Request Types ──

export interface FormDefinitionBody {
  name: string;
  description?: string;
  schema: unknown;
  category?: string;
}

export interface FormSubmissionBody {
  formId: string;
  patientId?: string;
  appointmentId?: string;
  data: unknown;
}

// ── Workflow Request Types ──

export interface WorkflowDefinitionBody {
  name: string;
  description?: string;
  category?: string;
  steps: unknown[];
  triggers?: unknown[];
}

export interface WorkflowInstanceBody {
  definitionId: string;
  referenceId?: string;
  referenceType?: string;
  assignedTo?: string;
  context?: unknown;
}

export interface WorkflowStatusBody {
  status: string;
}

// ── Compliance Request Types ──

export interface CompliancePolicyBody {
  title: string;
  code: string;
  category?: string;
  description?: string;
  content?: string;
  effectiveDate?: string;
  reviewDate?: string;
}

export interface ComplianceAuditBody {
  title: string;
  type?: string;
  scheduledDate?: string;
  scope?: string;
  auditor?: string;
}

export interface ComplianceAuditStatusBody {
  status: string;
  completedDate?: string;
  findings?: string;
  recommendations?: string;
}

export interface BreachLogBody {
  type: string;
  detectedDate: string;
  severity?: string;
  description: string;
  affectedData?: string;
  affectedRecords?: number;
  actionTaken?: string;
}

export interface BreachLogStatusBody {
  status: string;
  actionTaken?: string;
}

// ── AI Request Types ──

export interface AiProviderBody {
  name: string;
  provider: string;
  apiEndpoint?: string;
  apiKeyEncrypted?: string;
  config?: unknown;
}

export interface AiModelBody {
  providerId: string;
  modelName: string;
  displayName: string;
  capabilities?: unknown;
  costPer1kInput?: number;
  costPer1kOutput?: number;
  maxTokens?: number;
}

export interface AiAssistantBody {
  modelId: string;
  name: string;
  slug?: string;
  category?: string;
  systemPrompt: string;
  tools?: unknown;
  config?: unknown;
}

export interface AiNoteUpdateBody {
  status?: string;
  doctorCorrections?: string;
  generatedNote?: string;
}

export interface AiDiagnosisBody {
  patientId: string;
  appointmentId?: string;
  symptoms: string;
  age?: number;
  gender?: string;
  medicalHistory?: string;
}

export interface AiDiagnosisFeedbackBody {
  selectedCode: string;
  wasAccepted: boolean;
  feedback?: string;
}

// ── Automation Request Types ──

export interface AutomationRuleBody {
  name?: string;
  slug?: string;
  category?: string;
  triggerType?: string;
  triggerEvent?: string;
  triggerConfig?: unknown;
  conditions?: unknown[];
  description?: string;
  isActive?: boolean;
  priority?: number;
  maxExecutions?: number;
  cooldownMinutes?: number;
}

export interface AutomationTriggerBody {
  inputData?: Record<string, unknown>;
}

// ── Barcode Request Types ──

export interface BarcodeTemplateBody {
  name: string;
  code: string;
  category?: string;
  format?: string;
  symbology?: string;
  fields?: unknown;
  labelTemplate?: string;
  labelConfig?: unknown;
  includeHumanReadable?: boolean;
}

export interface BarcodeLabelBody {
  templateId: string;
  referenceId: string;
  referenceType: string;
  barcodeData: string;
  format?: string;
  expiresAt?: string;
}

export interface BarcodeRegistryBody {
  code: string;
  type: string;
  entityType: string;
  entityId: string;
  label?: string;
  payload?: unknown;
}

export interface BarcodeScanBody {
  labelId?: string;
  barcodeData: string;
  action: string;
  location?: string;
  notes?: string;
  metadata?: unknown;
}

// ── BI / Analytics Request Types ──

export interface BiQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
  doctorId?: string;
  granularity?: string;
}

export interface AiScheduleBody {
  scheduleDate: string;
  constraints?: unknown;
}

export interface AiPredictionBody {
  predictionType: string;
  relatedType?: string;
  relatedId?: string;
  features?: unknown;
  targetDate?: string;
}

export interface AiRiskScoreBody {
  patientId: string;
  riskType: string;
  factors?: unknown;
}

// ── Data Export Request Types ──

export interface ExportDefinitionBody {
  name: string;
  entityType: string;
  format?: string;
  columns?: unknown[];
  filters?: unknown;
  isScheduled?: boolean;
  schedule?: string;
}

export interface ExportRunBody {
  filters?: unknown;
}

// ── Dashboard Widgets Request Types ──

export interface WidgetBody {
  widgetType: string;
  title: string;
  config?: unknown;
  position?: number;
  size?: string;
  isVisible?: boolean;
  refreshInterval?: number;
}

// ── System Monitor Request Types ──

export interface SystemMetricsQuery {
  metric?: string;
  startDate?: string;
  endDate?: string;
}

// ── Patient Messaging Request Types ──

export interface MessageBody {
  patientId: string;
  subject?: string;
  body: string;
  channel?: string;
  parentId?: string;
  attachments?: unknown;
}

// ── Online Booking Request Types ──

export interface BookingSlotQuery {
  doctorId?: string;
  branchId?: string;
  date?: string;
}

export interface BookingSlotBody {
  doctorId: string;
  branchId?: string;
  date: string;
  startTime: string;
  endTime: string;
  slotType?: string;
}

export interface BookingRequestBody {
  slotId: string;
  patientName?: string;
  patientPhone?: string;
  patientEmail?: string;
  patientId?: string;
  reason?: string;
  notes?: string;
  source?: string;
}

// ── Integration Request Types ──

export interface IntegrationBody {
  name: string;
  type: string;
  provider: string;
  config?: unknown;
  credentials?: unknown;
}

export interface IntegrationStatusBody {
  status: string;
}

// ── Webhook Request Types ──

export interface WebhookBody {
  name: string;
  url: string;
  events?: unknown[];
  headers?: unknown;
  secret?: string;
  timeoutSeconds?: number;
  integrationId?: string;
}

// ── API Key Request Types ──

export interface ApiKeyBody {
  name: string;
  permissions?: unknown;
  rateLimit?: number;
  allowedIps?: unknown;
  expiresAt?: string;
}

// ── Notification Request Types ──

export interface NotificationBody {
  userId: string;
  title: string;
  message: string;
  type?: string;
  channel?: string;
  metadata?: unknown;
}

export interface NotificationTemplateBody {
  name: string;
  type: string;
  channel: string;
  subject?: string;
  body: string;
  variables?: unknown[];
}

// ── Session Manager Request Types ──

export interface SessionQuery {
  userId?: string;
}

// ── SaaS Billing Request Types ──

export interface PlanBody {
  name: string;
  slug?: string;
  description?: string;
  category?: string;
  priceMonthly: number;
  priceYearly?: number;
  currency?: string;
  features?: unknown;
  limits?: unknown;
  modules?: unknown;
  maxUsers?: number;
  maxBranches?: number;
  maxStorageGb?: number;
}

export interface SubscriptionBody {
  planId: string;
  billingCycle?: string;
  paymentProvider?: string;
  paymentProviderId?: string;
}

export interface SubscriptionStatusBody {
  status: string;
}

// ── White Label Request Types ──

export interface BrandingBody {
  brandName?: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  customCss?: string;
  customJs?: string;
  loginPage?: string;
  emailTemplates?: unknown;
}

export interface DomainBody {
  domain: string;
  isPrimary?: boolean;
}

// ── Dr Backup Request Types ──

export interface BackupConfigBody {
  name: string;
  type?: string;
  schedule?: string;
  storageLocation?: string;
  retentionDays?: number;
  includeSchemas?: unknown;
  excludeTables?: unknown;
  encryptionKeyRef?: string;
}

// ── Data Warehouse Request Types ──

export interface DwQuery {
  startDate?: string;
  endDate?: string;
  department?: string;
  granularity?: string;
}

// ── Compliance Reports Request Types ──

export interface ComplianceReportBody {
  reportType: string;
  period?: string;
  startDate?: string;
  endDate?: string;
  format?: string;
}

// ── Audit Request Types ──

export interface AuditQuery extends PaginationQuery {
  entity?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}

// ── Reports Request Types ──

export interface ReportBody {
  name: string;
  type: string;
  params?: unknown;
  format?: string;
}

export interface ReportScheduleBody {
  reportId: string;
  frequency: string;
  recipients?: unknown;
}

// ── Multi-branch Request Types ──

export interface BranchBody {
  name: string;
  code: string;
  phone: string;
  email?: string;
  address?: unknown;
  timezone?: string;
}

export interface BranchStatusBody {
  status: string;
}

// ── Regions Request Types ──

export interface RegionBody {
  name: string;
  code: string;
  type?: string;
}

// ── User Preferences Request Types ──

export interface UserSettingBody {
  theme?: string;
  timezone?: string;
  dateFormat?: string;
  timeFormat?: string;
  itemsPerPage?: number;
  dashboardConfig?: unknown;
  shortcuts?: unknown;
  quickSearchEnabled?: boolean;
}

export interface NotificationPrefBody {
  channel: string;
  eventType: string;
  isEnabled: boolean;
}

// ── Medical Content Request Types ──

export interface MedicalContentBody {
  title: string;
  type: string;
  content: string;
  category?: string;
  tags?: string[];
  isPublished?: boolean;
}

// ── Advanced Communication Request Types ──

export interface WhatsAppSendBody {
  to: string;
  message?: string;
  templateName?: string;
  templateParams?: string[];
  mediaUrl?: string;
}

export interface VoiceCallBody {
  to: string;
  callType?: string;
  patientId?: string;
  appointmentId?: string;
}

export interface VoiceConferenceBody {
  participants: string[];
  patientId?: string;
}

export interface ChatMessageBody {
  conversationId: string;
  message: string;
  messageType?: string;
  fileUrl?: string;
}

export interface ChatConversationBody {
  type?: string;
  name?: string;
  participantIds: string[];
}

// ── Financial Deepening Request Types ──

export interface ExpenseCategoryBody {
  name: string;
  code: string;
  type?: string;
  description?: string;
}

export interface ExpenseBody {
  title: string;
  amount: number;
  categoryId?: string;
  branchId?: string;
  expenseDate?: string;
  description?: string;
  paymentMethod?: string;
  vendorName?: string;
  vendorTaxId?: string;
  taxType?: string;
  taxAmount?: number;
}

export interface ExpenseStatusBody {
  status: string;
}

export interface BudgetPlanBody {
  name: string;
  periodStart: string;
  periodEnd: string;
  totalBudget: number;
  lineItems?: BudgetLineItemBody[];
}

export interface BudgetLineItemBody {
  name: string;
  categoryId?: string;
  budgetedAmount: number;
  notes?: string;
}

// ── Patient Portal Request Types ──

export interface PortalBookingBody {
  doctorId: string;
  slotId: string;
  reason?: string;
  notes?: string;
}

// ── Bulk Import Request Types ──

export interface BulkImportBody {
  entityType: string;
  fileName: string;
  fileUrl: string;
}

// ── Print Templates Request Types ──

export interface PrintTemplateBody {
  name: string;
  type: string;
  category?: string;
  content: string;
  variables?: unknown[];
  isActive?: boolean;
  isDefault?: boolean;
}

// ── PDF Generator Request Types ──

export interface PdfGenerateBody {
  type: string;
  entityId: string;
  templateId?: string;
  data?: unknown;
}

// ── Common Request Types ──

export interface StatusBody {
  status: string;
}

export interface ToggleBody {
  isActive: boolean;
}

// ── Advanced Query Types ──

export interface PatientPortalQuery extends PaginationQuery {
  status?: string;
  patientId?: string;
}

export interface MultiBranchQuery extends PaginationQuery {
  status?: string;
  search?: string;
}

export interface ComplianceQuery extends PaginationQuery {
  status?: string;
  category?: string;
}

export interface ComplianceReportsQuery extends PaginationQuery {
  type?: string;
  status?: string;
}

// ── Update body type ──

export type RecordStringUnknown = Record<string, unknown>;
