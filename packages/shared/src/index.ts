export type {
  Patient, Address, EmergencyContact, PatientInsurance,
  Allergy, MedicalHistoryEntry, PatientStatus,
  Appointment, AppointmentType, AppointmentStatus, AppointmentReminder,
  EMRRecord, EncounterType, EMRStatus, Diagnosis, Procedure,
  PrescribedMedication as Medication, Vitals,
  Invoice, InvoiceItem, InvoiceStatus, PaymentMethod,
  Branch,
} from './types/domain.js';

export type {
  ApiResponse, PaginationParams, PaginatedResponse,
  AuditLog,
} from './types/api.js';
export type { ApiValidationError } from './types/api.js';

export type {
  User, UserStatus, Role, Permission,
  AuthTokens, LoginRequest, LoginResponse,
} from './types/auth.js';

export {
  PERMISSIONS,
} from './types/auth.js';

export type {
  TenantInfo, CreateTenantRequest, TenantStatus,
} from './types/multi-tenancy.js';

export {
  PERMISSION_ACTIONS,
  PERMISSION_SCOPES,
  PERMISSION_CATALOG,
  PERMISSION_MODULES,
  SEED_ROLES,
  HOSPITAL_ROLE_CATALOG,
  HOSPITAL_ROLE_GRANTS,
  hospitalRoleTemplate,
  hospitalRoleGrantSignature,
  validateHospitalRoleCatalog,
  permissionKey,
  allPermissionKeys,
  expandGrantKey,
  expandRoleGrants,
  normalizeLegacyPermission,
} from './authz/index.js';
export type { PermissionAction, PermissionScope, Grant, RoleTemplate } from './authz/index.js';

export {
  APP_NAME, APP_VERSION, PAGINATION, PASSWORD, JWT,
  DATE_FORMATS, CURRENCIES, BLOOD_TYPES, GENDERS, APPOINTMENT_TYPES,
} from './config/constants.js';

export {
  CLINIC_CORE_MODULES,
  CLINIC_OPTIONAL_MODULES,
  CLINIC_MODULE_CATALOG,
  CLINIC_CONFIGURATION_REGISTRY,
  clinicConfigurationDefinition,
  isClinicModuleKey,
} from './config/clinic-configuration.js';
export type {
  ClinicConfigurationScope,
  ClinicConfigurationValueType,
  ClinicConfigurationDefinition,
  ClinicModuleKey,
} from './config/clinic-configuration.js';

export {
  CLINIC_WORKING_DAYS,
  parseClinicWorkingHours,
  validateClinicWorkingHours,
  isValidClinicWorkingHours,
  clinicWorkingDayForDate,
  clinicWorkingHoursWindow,
  formatClinicWorkingHours,
} from './config/clinic-working-hours.js';
export type {
  ClinicWorkingDay,
  ClinicWorkingHoursInterval,
  ClinicWorkingHoursValidationError,
} from './config/clinic-working-hours.js';

export { getEnv } from './config/environment.js';
export type { Environment } from './config/environment.js';

export {
  generateId, generateMedicalRecordNumber, generateInvoiceNumber, encryptField, decryptField, isEncrypted,
  hashString, slugify, maskEmail, generateOtp,
} from './utils/crypto.js';

export {
  isValidEmail, isValidPhone, isValidMrn, isValidDate, validateWebhookUrl,
  isValidBloodType, isValidIcd10Code, isStrongPassword,
} from './utils/validators.js';

export {
  formatCurrency, formatDate, formatTime, formatDateTime,
  calculateAge, calculateBMI, getBMICategory,
} from './utils/formatters.js';

export {
  AppError,
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  TenantNotFoundError,
  PatientNotFoundError,
  AppointmentNotFoundError,
} from './errors/index.js';
export { UnauthorizedError } from './errors/index.js';

export type { RequestContext } from './middleware/index.js';
export { hasPermission, hasAnyPermission } from './middleware/index.js';

export { translations, t as translate, getDir } from './i18n/index.js';
export type { TranslationKey, Locale, Namespace } from './i18n/index.js';
