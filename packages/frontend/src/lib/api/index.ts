export { default, apiClient } from './client';
export * from './types';

export { securityApi } from './security';
export { auditApi } from './audit';
export { communicationsApi } from './communications';
export { dmsApi } from './dms';
export type { DocumentItem, DocumentCategory, UploadMetadata } from './dms';
export { financialApi } from './financial';
export type {
  RevenueSummary,
  AgingBucket,
  TopPatient,
  PlRevenue,
  PlExpenseCategory,
  PlExpenses,
  PlMonthData,
  PlExpenseMonthData,
  PlReport,
  ExpenseItem,
  BudgetPlan,
  CreateExpensePayload,
  CreateBudgetPlanPayload,
} from './financial';
export { insuranceApi } from './insurance';
export type { InsuranceCompany, InsuranceClaim, CreateCompanyPayload, CreateClaimPayload, UpdateClaimPayload } from './insurance';
export { claimsApi } from './claims';
export type {
  InsuranceClaimsListParams,
  InsuranceClaimListItem,
  InsuranceClaimsSummary,
  CreateInsuranceClaimPayload,
  UpdateClaimStatusPayload,
} from './claims';
export { drApi } from './dr';
export type {
  BackupConfig,
  BackupExecution,
  DrConfig,
  CreateBackupConfigPayload,
  RunBackupPayload,
} from './dr';
export { whiteLabelApi } from './white-label';
export type {
  TenantBranding,
  TenantDomain,
  UpdateBrandingPayload,
  AddDomainPayload,
} from './white-label';
export { saasApi } from './saas';
export type {
  SubscriptionPlan,
  TenantSubscription,
  SaasInvoice,
  UsageRecord,
  UsageTotals,
  SaasUsageData,
  CreateSubscriptionPayload,
  ChangePlanPayload,
} from './saas';
export { integrationsApi } from './integrations';
export type {
  IntegrationCatalogItem,
  IntegrationConnection,
  IntegrationWebhook,
  WebhookLog,
  CreateConnectionPayload,
  CreateWebhookPayload,
} from './integrations';
export { paymentApi, egyptPaymentApi } from './payment';
export { clinicalApi } from './clinical';
export { authApi } from './auth';
export { portalApi, staffPortalApi } from './portal';
export { patientsApi } from './patients';
export { appointmentsApi } from './appointments';
export { emrApi } from './emr';
export { billingApi } from './billing';
export type {
  BillingListParams,
  CreateInvoicePayload,
  PayInvoicePayload,
} from './billing';
export { complianceApi } from './compliance';
export type {
  CompliancePolicy,
  ComplianceAudit,
  ConsentLog,
  BreachLog,
  ComplianceReport,
  HipaaAuditLog,
  HipaaSummary,
  RetentionPolicy,
  Baa,
  CreateComplianceReportPayload,
  CreateBaaPayload,
} from './compliance';
export { formsApi } from './forms';
export type { FormDefinition, FormSubmission, CreateFormDefinitionPayload, SubmitFormPayload } from './forms';
export { workflowApi } from './workflow';
export type { WorkflowDefinition, WorkflowInstance, CreateWorkflowDefinitionPayload, StartWorkflowInstancePayload } from './workflow';
export { crmApi } from './crm';
export type { CrmCampaign, PatientFeedback, CreateCampaignPayload } from './crm';
export { hrApi } from './hr';
export type { Employee, LeaveRequest, PayrollEntry, PayrollRun, CreateEmployeePayload, CreateLeavePayload } from './hr';
export { inventoryApi } from './inventory';
export type {
  InventoryItem,
  Warehouse,
  PurchaseOrderItem,
  PurchaseOrder,
  CreateItemPayload,
  CreateWarehousePayload,
  CreatePoPayload,
} from './inventory';
export { aiHubApi } from './ai';
export type {
  AiAssistant,
  AiProvider,
  AiModel,
  AiRequest,
  AiCostDaily,
  AiCostData,
  CreateAiAssistantPayload,
  CreateAiProviderPayload,
} from './ai';
export { dashboardApi } from './dashboard';
export { reportsApi } from './reports';
export type {
  ReportColumn,
  ReportSchedule,
  ReportExecution,
  ReportDefinition,
  CreateReportPayload,
  CreateSchedulePayload,
} from './reports';
export { biApi } from './bi';
export type {
  BiDashboard,
  BiWidget,
  BiKpiAppointments,
  BiKpiRevenue,
  BiKpiPatients,
  BiKpiClinical,
  CreateBiDashboardPayload,
  CreateBiWidgetPayload,
} from './bi';
export { commonApi } from './common';
