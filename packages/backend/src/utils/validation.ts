import { z } from 'zod';
import { clinicConfigurationDefinition } from '@healthcare/shared/config/clinic-configuration';

const DEFAULT_CLINIC_TIMEZONE = String(clinicConfigurationDefinition('clinic.timezone.default')?.defaultValue || 'UTC');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const patientIdSchema = z.object({
  patientId: z.string().uuid(),
});

export const appointmentIdSchema = z.object({
  appointmentId: z.string().uuid(),
});

export const createPatientSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((val) => {
    const dob = new Date(val);
    const now = new Date();
    const minDate = new Date('1900-01-01');
    return dob <= now && dob >= minDate;
  }, 'Date of birth must be between 1900 and today'),
  gender: z.enum(['male', 'female']),
  // The core does not assume a country-specific identifier format. Country-level
  // checksum rules belong in a tenant policy or integration module.
  nationalId: z.string().trim().min(4).max(32).regex(/^[\p{L}\p{N}][\p{L}\p{N}\s-]{3,31}$/u, 'Invalid national identifier format'),
  phone: z.string().min(7).max(20),
  email: z.string().email().or(z.literal('')).optional(),
  nationality: z.string().optional(),
  bloodType: z.string().optional(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string(),
  }).optional(),
  emergencyContact: z.object({
    name: z.string(),
    relation: z.string(),
    phone: z.string(),
  }).optional(),
  notes: z.string().optional(),
}).passthrough();

export const updatePatientSchema = createPatientSchema.partial();

export const createAppointmentSchema = z.object({
  patientId: z.string().uuid(),
  doctorId: z.string().uuid(),
  branchId: z.string().uuid(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int().positive().default(15),
  type: z.enum(['consultation', 'followup', 'emergency', 'checkup', 'procedure', 'telemedicine', 'vaccination']),
  reason: z.string().optional(),
  notes: z.string().optional(),
  isWalkIn: z.boolean().default(false),
  isVirtual: z.boolean().default(false),
  timezone: z.string().max(50).default(DEFAULT_CLINIC_TIMEZONE),
});

export const updateAppointmentSchema = createAppointmentSchema.partial();

export const createEmrSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  encounterDate: z.string().optional(),
  encounterType: z.enum(['new', 'followup', 'emergency', 'annual', 'preoperative', 'postoperative', 'telemedicine']),
  chiefComplaint: z.string().optional(),
  subjective: z.string().optional(),
  objective: z.string().optional(),
  assessment: z.string().optional(),
  plan: z.string().optional(),
  vitals: z.object({
    bloodPressureSystolic: z.number(),
    bloodPressureDiastolic: z.number(),
    heartRate: z.number(),
    respiratoryRate: z.number(),
    temperature: z.number(),
    oxygenSaturation: z.number(),
    height: z.number(),
    weight: z.number(),
    painLevel: z.number().min(0).max(10),
  }).optional(),
  notes: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  items: z.array(z.object({
    description: z.string().min(1),
    code: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().positive(),
    type: z.enum(['consultation', 'procedure', 'medication', 'laboratory', 'radiology', 'supply', 'other']),
  })).min(1),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  dueDate: z.string(),
  notes: z.string().optional(),
  insuranceClaim: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
  mfaCode: z.string().optional(),
});

// Queue validation
export const createQueueEntrySchema = z.object({
  patientId: z.string().uuid(),
  serviceType: z.string().min(1).max(50),
  priority: z.number().int().min(0).max(2).default(0),
});

// Nursing validation
export const createNursingTaskSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(['general', 'medication', 'vitals', 'wound_care', 'patient_education', 'discharge']).default('general'),
  priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
  dueAt: z.string().optional(),
});

// Home Visits validation
export const createHomeVisitSchema = z.object({
  patientId: z.string().uuid(),
  visitType: z.enum(['checkup', 'followup', 'emergency', 'vaccination', 'physiotherapy']).default('checkup'),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  address: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
});

// Telemedicine validation
export const createTelemedicineSessionSchema = z.object({
  patientId: z.string().uuid(),
  provider: z.enum(['internal', 'zoom', 'teams', 'other']).default('internal'),
  meetingLink: z.string().url().optional().or(z.literal('')),
  recordingEnabled: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
});

// Laboratory validation
export const createLabOrderSchema = z.object({
  patientId: z.string().uuid(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  clinicalNotes: z.string().max(2000).optional(),
  tests: z.array(z.object({
    testCode: z.string(),
    testName: z.string(),
    specimenType: z.string().optional(),
    referenceRange: z.string().optional(),
    unit: z.string().optional(),
  })).min(1),
});

// Radiology validation
export const createRadiologyOrderSchema = z.object({
  patientId: z.string().uuid(),
  studyType: z.string().min(1).max(100),
  bodyPart: z.string().max(100).optional(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  clinicalIndication: z.string().max(2000).optional(),
});

// Pharmacy validation
export const createDrugSchema = z.object({
  drugName: z.string().min(1).max(200),
  genericName: z.string().max(200).optional(),
  brandName: z.string().max(200).optional(),
  dosageForm: z.enum(['tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler']).default('tablet'),
  strength: z.string().max(50).optional(),
  stockQuantity: z.number().int().min(0).default(0),
  reorderLevel: z.number().int().min(0).default(10),
  unitPrice: z.number().min(0).default(0),
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().optional(),
  manufacturer: z.string().max(200).optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    drugName: z.string().min(1),
    dosage: z.string().optional(),
    route: z.string().optional(),
    frequency: z.string().optional(),
    duration: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    refills: z.number().int().min(0).default(0),
    instructions: z.string().optional(),
  })).min(1),
});

// Referral validation
export const createReferralSchema = z.object({
  patientId: z.string().uuid(),
  referralType: z.enum(['specialist', 'general', 'internal', 'external']).default('specialist'),
  priority: z.enum(['normal', 'urgent', 'emergency']).default('normal'),
  reason: z.string().min(1).max(2000),
  clinicalNotes: z.string().max(2000).optional(),
  externalFacility: z.string().max(200).optional(),
  externalDoctor: z.string().max(200).optional(),
  consentObtained: z.boolean().default(true),
});
// Inventory validation
export const createInventoryItemSchema = z.object({
  warehouseId: z.string().uuid(),
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
  unit: z.string().max(20).default('piece'),
  quantity: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(10),
  unitCost: z.number().min(0).default(0),
  unitPrice: z.number().min(0).default(0),
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().optional(),
  serialNumber: z.string().max(100).optional(),
  manufacturer: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  type: z.enum(['main', 'branch', 'storage']).default('main'),
});

export const updateStockSchema = z.object({
  quantity: z.number().int(),
  type: z.enum(['receipt', 'dispensation', 'adjustment', 'transfer', 'return']).default('receipt'),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
  notes: z.string().max(500).optional(),
});

export const createPurchaseOrderSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  supplier: z.string().min(1).max(200),
  orderDate: z.string().optional(),
  expectedDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(z.object({
    itemName: z.string().min(1).max(200),
    sku: z.string().max(50).optional(),
    quantityOrdered: z.number().int().positive(),
    unitCost: z.number().min(0).default(0),
  })).min(1),
});
// HR validation
export const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  department: z.string().min(1).max(100),
  position: z.string().min(1).max(100),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).default('full_time'),
  hireDate: z.string().optional(),
  baseSalary: z.number().min(0).default(0),
  payFrequency: z.enum(['monthly', 'weekly', 'biweekly']).default('monthly'),
});

export const createLeaveRequestSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.enum(['annual', 'sick', 'personal', 'maternity', 'unpaid']).default('annual'),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().max(500).optional(),
});
// CRM validation
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['email', 'sms', 'social', 'other']).default('email'),
  description: z.string().max(1000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.number().min(0).default(0),
  targetCount: z.number().int().min(0).default(0),
});
// Workflow validation
export const createWorkflowDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  category: z.string().max(50).default('general'),
  steps: z.array(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const startWorkflowInstanceSchema = z.object({
  definitionId: z.string().uuid(),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().uuid().optional(),
  currentStep: z.number().int().min(0).default(0),
  context: z.record(z.unknown()).optional(),
  data: z.record(z.unknown()).optional(),
  assignedTo: z.string().uuid().optional(),
});
// Forms validation
export const createFormDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  category: z.string().max(50).default('general'),
  schema: z.record(z.unknown()).optional(),
  uiSchema: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
});

export const submitFormSchema = z.object({
  formId: z.string().uuid(),
  patientId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  data: z.record(z.unknown()),
  status: z.string().max(20).default('completed'),
});
// Compliance validation
export const createCompliancePolicySchema = z.object({
  title: z.string().min(1).max(200),
  code: z.string().min(1).max(50),
  category: z.string().max(50).default('general'),
  description: z.string().max(1000).optional(),
  content: z.string().max(10000).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  effectiveDate: z.string().optional(),
  reviewDate: z.string().optional(),
});

export const createComplianceAuditSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['internal', 'external', 'regulatory']).default('internal'),
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).default('planned'),
  scheduledDate: z.string().optional(),
  scope: z.string().max(1000).optional(),
  auditor: z.string().max(200).optional(),
});

export const createBreachLogSchema = z.object({
  type: z.string().min(1).max(100),
  detectedDate: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  description: z.string().max(2000).optional(),
  affectedData: z.string().max(500).optional(),
  affectedRecords: z.number().int().min(0).default(0),
  actionTaken: z.string().max(1000).optional(),
  status: z.enum(['open', 'investigating', 'resolved', 'closed']).default('open'),
});

// ── AI Hub ──
export const createAiProviderSchema = z.object({
  name: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  apiEndpoint: z.string().url().optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const updateAiProviderSchema = createAiProviderSchema.partial();

export const createAiModelSchema = z.object({
  providerId: z.string().uuid(),
  modelName: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  capabilities: z.enum(['chat', 'completion', 'embedding', 'image', 'multimodal']).default('chat'),
  costPer1kInput: z.number().min(0).optional(),
  costPer1kOutput: z.number().min(0).optional(),
  maxTokens: z.number().int().min(1).max(1000000).default(4096),
});

export const createAiAssistantSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  category: z.enum(['general', 'clinical', 'administrative', 'billing', 'patient']).default('general'),
  systemPrompt: z.string().max(10000).optional(),
  tools: z.array(z.string()).optional(),
  modelId: z.string().uuid().optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const updateAiAssistantSchema = createAiAssistantSchema.partial();

export const chatCompletionSchema = z.object({
  assistantId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
  prompt: z.string().min(1).max(50000),
  source: z.string().max(50).optional(),
});

// ── BI Dashboards ──
export const createBiDashboardSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  category: z.enum(['executive', 'clinical', 'financial', 'operational', 'custom']).default('executive'),
  description: z.string().max(2000).optional(),
  layout: z.array(z.record(z.unknown())).optional(),
  refreshInterval: z.string().max(20).default('5m'),
});

export const updateBiDashboardSchema = createBiDashboardSchema.partial();

export const createBiWidgetSchema = z.object({
  title: z.string().min(1).max(200),
  widgetType: z.enum(['kpi', 'chart', 'table', 'gauge', 'map', 'text', 'iframe']).default('kpi'),
  dataSource: z.string().max(100).default('appointments'),
  config: z.record(z.unknown()).optional(),
  query: z.record(z.unknown()).optional(),
  width: z.number().int().min(1).max(12).default(4),
  height: z.number().int().min(1).max(12).default(2),
  positionX: z.number().int().min(0).default(0),
  positionY: z.number().int().min(0).default(0),
});

export const updateBiWidgetSchema = createBiWidgetSchema.partial();

// ── Reports ──
export const createReportSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().max(100).optional(),
  category: z.enum(['clinical', 'financial', 'operational', 'compliance', 'executive', 'custom']).default('clinical'),
  description: z.string().max(2000).optional(),
  queryConfig: z.record(z.unknown()).optional(),
  columns: z.array(z.record(z.unknown())).optional(),
  filters: z.array(z.record(z.unknown())).optional(),
  sorting: z.array(z.record(z.unknown())).optional(),
  exportFormats: z.array(z.enum(['csv', 'pdf', 'excel', 'json'])).default(['csv', 'pdf']),
});

export const updateReportSchema = createReportSchema.partial();

export const createScheduleSchema = z.object({
  cron: z.string().max(50).default('0 8 * * 1'),
  recipients: z.array(z.string().email()).optional(),
  format: z.enum(['csv', 'pdf', 'excel']).default('pdf'),
  params: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export const executeReportSchema = z.object({
  format: z.enum(['csv', 'pdf', 'excel']).default('csv'),
});

// ── Financial Reports ──
export const createExpenseSchema = z.object({
  title: z.string().min(1).max(200),
  amount: z.number().positive(),
  categoryId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(2000).optional(),
  paymentMethod: z.enum(['cash', 'card', 'bank_transfer', 'fawry', 'instapay', 'cheque']).default('cash'),
  vendorName: z.string().max(200).optional(),
  vendorTaxId: z.string().max(50).optional(),
  taxType: z.enum(['none', 'vat_14', 'withholding', 'stamp']).optional(),
  taxAmount: z.number().min(0).default(0),
});

export const updateExpenseSchema = createExpenseSchema.partial();

export const createBudgetPlanSchema = z.object({
  name: z.string().min(1).max(200),
  period: z.string().max(50),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectedRevenue: z.number().min(0).default(0),
  projectedExpenses: z.number().min(0).default(0),
});

export const plReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── Insurance Claims ──
export const createInsuranceCompanySchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().min(2).max(50),
  contractType: z.enum(['network', 'non_network', 'corporate']).default('network'),
  discountRate: z.number().min(0).max(100).default(0),
});

export const createInsuranceClaimSchema = z.object({
  patientId: z.string().uuid(),
  invoiceId: z.string().uuid(),
  insuranceId: z.string().uuid(),
  claimedAmount: z.number().positive(),
  notes: z.string().max(2000).optional(),
});

export const updateClaimStatusSchema = z.object({
  status: z.enum(['acknowledged', 'in_review', 'approved', 'denied', 'paid']),
  approvedAmount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).optional(),
  denialReason: z.string().max(2000).optional(),
});

export const insuranceClaimsListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  insuranceId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
});

// ── Integrations ──
export const createIntegrationConnectionSchema = z.object({
  definitionId: z.string().uuid(),
  name: z.string().min(1).max(200),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const updateIntegrationConnectionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  credentials: z.record(z.unknown()).optional(),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['connected', 'disconnected', 'error', 'pending']).optional(),
});

export const createWebhookSchema = z.object({
  integrationId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(200),
  url: z.string().url(),
  events: z.array(z.string().max(100)).default(['*']),
  headers: z.record(z.string()).optional(),
  retryCount: z.number().int().min(0).max(10).default(3),
  timeoutSeconds: z.number().int().min(1).max(300).default(30),
});

export const updateWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string().max(100)).optional(),
  headers: z.record(z.string()).optional(),
  status: z.enum(['active', 'disabled', 'paused']).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
});


// ── SaaS Billing ──
export const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['monthly', 'yearly']).default('monthly'),
  addons: z.array(z.string().max(100)).optional(),
  discounts: z.array(z.string().max(100)).optional(),
});

export const changePlanSchema = z.object({
  planId: z.string().uuid(),
  billingCycle: z.enum(['monthly', 'yearly']).optional(),
});

export const trackUsageSchema = z.object({
  subscriptionId: z.string().uuid().optional().nullable(),
  metric: z.string().min(1).max(100),
  quantity: z.number().int().min(1).default(1),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});


// ── White-Label ──
export const updateBrandingSchema = z.object({
  brandName: z.string().max(200).optional(),
  logoUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().max(100).optional(),
  customCss: z.string().max(50000).optional().nullable(),
  customJs: z.string().max(50000).optional().nullable(),
});

export const addDomainSchema = z.object({
  domain: z.string().min(3).max(253).regex(/^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$/i),
  isPrimary: z.boolean().optional().default(false),
});


// ── Compliance Reports ──
export const createComplianceReportSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(['internal', 'external', 'regulatory', 'hipaa', 'gdpr']).default('internal'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data: z.record(z.unknown()).optional(),
  format: z.enum(['pdf', 'csv', 'json']).default('pdf'),
});

export const updateComplianceReportSchema = z.object({
  status: z.enum(['draft', 'generated', 'reviewed', 'archived']).optional(),
  findings: z.string().max(10000).optional(),
  recommendations: z.string().max(10000).optional(),
});

export const hipaaAuditQuerySchema = z.object({
  entity: z.string().max(100).optional(),
  days: z.coerce.number().int().min(1).max(365).default(90),
  userId: z.string().uuid().optional(),
});

export const createRetentionPolicySchema = z.object({
  entity: z.string().min(1).max(100),
  retentionDays: z.number().int().min(1).max(3650).default(365),
  action: z.enum(['archive', 'delete', 'anonymize', 'notify']).default('archive'),
  isActive: z.boolean().optional(),
});

export const updateRetentionPolicySchema = z.object({
  retentionDays: z.number().int().min(1).max(3650).optional(),
  action: z.enum(['archive', 'delete', 'anonymize', 'notify']).optional(),
  isActive: z.boolean().optional(),
});

export const createBaaSchema = z.object({
  organizationName: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional(),
  scope: z.string().max(2000).optional(),
  executedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['draft', 'executed', 'expired', 'terminated']).default('draft'),
  terms: z.string().max(50000).optional(),
});

export const updateBaaSchema = z.object({
  status: z.enum(['draft', 'executed', 'expired', 'terminated']).optional(),
  scope: z.string().max(2000).optional(),
  terms: z.string().max(50000).optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});


// ── DR Backup ──
export const createBackupConfigSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['full', 'incremental', 'differential']).default('full'),
  schedule: z.string().max(50).default('0 2 * * *'),
  retentionDays: z.number().int().min(1).max(3650).default(30),
  storageLocation: z.string().max(500).default('minio://backups'),
  includeSchemas: z.array(z.string().max(100)).default(['public']),
  excludeTables: z.array(z.string().max(200)).optional(),
  isActive: z.boolean().optional(),
});

export const updateBackupConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.string().max(50).optional(),
  retentionDays: z.number().int().min(1).max(3650).optional(),
  isActive: z.boolean().optional(),
});

export const runBackupSchema = z.object({
  configId: z.string().uuid().optional().nullable(),
  type: z.enum(['full', 'incremental', 'differential']).default('full'),
});

export const updateDrConfigSchema = z.object({
  failoverStrategy: z.enum(['manual', 'automatic', 'hybrid']).optional(),
  rpoMinutes: z.number().int().min(1).max(1440).optional(),
  rtoMinutes: z.number().int().min(1).max(1440).optional(),
  crossRegionReplication: z.boolean().optional(),
  secondaryRegion: z.string().max(100).optional().nullable(),
});
