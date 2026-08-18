export type ClinicConfigurationScope = 'tenant' | 'branch' | 'department';

export type ClinicConfigurationValueType = 'string' | 'boolean' | 'number' | 'json';

export interface ClinicConfigurationDefinition {
  readonly key: string;
  readonly valueType: ClinicConfigurationValueType;
  readonly allowedScopes: readonly ClinicConfigurationScope[];
  readonly requiredFor: readonly string[];
  readonly defaultValue?: unknown;
  readonly sensitive?: boolean;
  readonly secret?: boolean;
  readonly description: string;
}

export const CLINIC_CORE_MODULES = [
  'patients',
  'appointments',
  'emr',
  'documents',
  'reports',
  'notifications',
  'communications',
  'settings',
] as const;

export const CLINIC_OPTIONAL_MODULES = [
  'billing',
  'pharmacy',
  'laboratory',
  'radiology',
  'nursing',
  'inventory',
  'insurance',
  'insurance_claims',
  'hr',
  'crm',
  'patient_portal',
  'online_booking',
  'integrations',
  'advanced_reporting',
  'bi',
  'automation',
] as const;

export const CLINIC_MODULE_CATALOG = [
  ...CLINIC_CORE_MODULES,
  ...CLINIC_OPTIONAL_MODULES,
] as const;

export type ClinicModuleKey = (typeof CLINIC_MODULE_CATALOG)[number];

const TENANT_BRANCH_DEPARTMENT: readonly ClinicConfigurationScope[] = ['tenant', 'branch', 'department'];
const TENANT_ONLY: readonly ClinicConfigurationScope[] = ['tenant'];

export const CLINIC_CONFIGURATION_REGISTRY: readonly ClinicConfigurationDefinition[] = [
  {
    key: 'clinic.profile.display_name',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['core'],
    description: 'The clinic name shown in the application and generated documents.',
  },
  {
    key: 'clinic.profile.branch_label',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: [],
    defaultValue: '',
    description: 'Legacy compatibility label for the clinic information form; branch records are authoritative for multi-branch configuration.',
  },
  {
    key: 'clinic.profile.legal_name',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['billing'],
    description: 'The legal organisation name used for regulated and financial documents.',
  },
  {
    key: 'clinic.profile.logo_url',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'A tenant-approved logo URL for the application and documents.',
  },
  {
    key: 'clinic.contact.email',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'The operational contact email for the applicable clinic scope.',
  },
  {
    key: 'clinic.contact.land_phone',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'The operational landline for the applicable clinic scope.',
  },
  {
    key: 'clinic.contact.whatsapp_phone',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['communications'],
    defaultValue: '',
    description: 'The configured WhatsApp contact number, not a provider credential.',
  },
  {
    key: 'clinic.contact.website',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: [],
    defaultValue: '',
    description: 'The public clinic website URL.',
  },
  {
    key: 'clinic.address.street',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'The street address for the applicable clinic scope.',
  },
  {
    key: 'clinic.address.city',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'The city for the applicable clinic scope.',
  },
  {
    key: 'clinic.address.country',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['core'],
    defaultValue: '',
    description: 'The country for the applicable clinic scope.',
  },
  {
    key: 'clinic.address.maps_url',
    valueType: 'string',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: [],
    defaultValue: '',
    description: 'An optional map URL for the applicable clinic scope.',
  },
  {
    key: 'clinic.operations.working_hours',
    valueType: 'json',
    allowedScopes: TENANT_BRANCH_DEPARTMENT,
    requiredFor: ['appointments'],
    defaultValue: [],
    description: 'Validated operating-hour intervals for scheduling.',
  },
  {
    key: 'clinic.locale.default',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['core'],
    defaultValue: 'en',
    description: 'The tenant default locale.',
  },
  {
    key: 'clinic.timezone.default',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['core'],
    defaultValue: 'UTC',
    description: 'The tenant default IANA timezone.',
  },
  {
    key: 'clinic.legal.license_number',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['billing'],
    defaultValue: '',
    sensitive: true,
    description: 'The organisation licence or registration number.',
  },
  {
    key: 'clinic.legal.tax_number',
    valueType: 'string',
    allowedScopes: TENANT_ONLY,
    requiredFor: ['billing'],
    defaultValue: '',
    sensitive: true,
    description: 'The organisation tax number.',
  },
] as const;

export function clinicConfigurationDefinition(key: string): ClinicConfigurationDefinition | undefined {
  return CLINIC_CONFIGURATION_REGISTRY.find((definition) => definition.key === key);
}

export function isClinicModuleKey(value: string): value is ClinicModuleKey {
  return (CLINIC_MODULE_CATALOG as readonly string[]).includes(value);
}
