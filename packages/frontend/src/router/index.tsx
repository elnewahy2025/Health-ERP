/**
 * Route configuration for Vision Healthcare ERP.
 *
 * All routes are defined in App.tsx using React Router v6.
 * This file provides the route definitions as a single source of truth
 * for navigation menus, breadcrumbs, and permission gating.
 */

export interface AppRoute {
  path: string;
  label: string;
  labelKey: string;
  icon?: string;
  children?: AppRoute[];
  requiredPermission?: string;
}

export const appRoutes: AppRoute[] = [
  { path: '/', label: 'Dashboard', labelKey: 'nav.dashboard', icon: 'LayoutDashboard' },
  { path: '/patients', label: 'Patients', labelKey: 'nav.patients', icon: 'Users' },
  { path: '/appointments', label: 'Appointments', labelKey: 'nav.appointments', icon: 'CalendarCheck' },
  { path: '/emr', label: 'Medical Records', labelKey: 'nav.emr', icon: 'FileText' },
  { path: '/billing', label: 'Billing', labelKey: 'nav.billing', icon: 'Receipt' },
  { path: '/pharmacy', label: 'Pharmacy', labelKey: 'nav.pharmacy', icon: 'PillBottle' },
  { path: '/laboratory', label: 'Laboratory', labelKey: 'nav.laboratory', icon: 'FlaskConical' },
  { path: '/radiology', label: 'Radiology', labelKey: 'nav.radiology', icon: 'ScanLine' },
  { path: '/inventory', label: 'Inventory', labelKey: 'nav.inventory', icon: 'Package' },
  { path: '/hr', label: 'HR & Payroll', labelKey: 'nav.hr', icon: 'UsersRound' },
  { path: '/reports', label: 'Reports', labelKey: 'nav.reports', icon: 'BarChart3' },
  { path: '/settings', label: 'Settings', labelKey: 'nav.settings', icon: 'Settings' },
  { path: '/admin', label: 'Administration', labelKey: 'nav.admin', icon: 'Shield' },
];

/**
 * Authorization matrix mirror for UI navigation. Keys match backend route
 * permissions exactly; the backend remains authoritative. `can()` gates
 * navigation items, direct URL access, buttons, and menus.
 */
export const routePermissions: Record<string, string> = {
  '/patients': 'patients.view',
  '/appointments': 'appointments.view',
  '/emr': 'emr.view',
  '/queue': 'queue.view',
  '/referrals': 'referrals.view',
  '/nursing': 'nursing.view',
  '/home-visits': 'home_visits.view',
  '/telemedicine': 'telemedicine.view',
  '/laboratory': 'laboratory.view',
  '/radiology': 'radiology.view',
  '/pharmacy': 'pharmacy.view',
  '/billing': 'billing.view',
  '/insurance': 'insurance.view',
  '/insurance-claims': 'insurance_claims.view',
  '/expenses': 'expenses.view',
  '/eta-invoicing': 'eta_invoicing.view',
  '/inventory': 'inventory.view',
  '/hr': 'hr.view',
  '/crm': 'crm.view',
  '/dms': 'documents.view',
  '/workflow': 'workflow.view',
  '/forms': 'forms.view',
  '/compliance': 'compliance.view',
  '/automation': 'automation.view',
  '/bi': 'bi.view',
  '/reports': 'reports.view',
  '/financial-reports': 'financial_reports.view',
  '/compliance-reports': 'compliance_reports.view',
  '/advanced-reporting': 'advanced_reporting.view',
  '/analytics-dashboard': 'analytics_dashboard.view',
  '/ai-hub': 'ai_hub.view',
  '/clinical-ai': 'clinical_ai.view',
  '/predictive-analytics': 'predictive_analytics.view',
  '/smart-scheduling': 'smart_scheduling.view',
  '/notifications': 'notifications.view',
  '/communications': 'communications.view',
  '/whatsapp': 'whatsapp.view',
  '/whatsapp-templates': 'whatsapp.view',
  '/voice-calls': 'voice_calls.view',
  '/chat': 'chat.view',
  '/patient-messages': 'patient_messages.view',
  '/patient-portal': 'patient_portal.view',
  '/online-booking': 'online_booking.view',
  '/patient-app': 'patient_self_service.view',
  '/patient-self-service': 'patient_self_service.view',
  '/post-visit-survey': 'crm.view',
  '/kiosk': 'queue.view',
  '/queue-display': 'queue.view',
  '/saas-billing': 'saas_billing.view',
  '/white-label': 'white_label.view',
  '/integrations': 'integrations.view',
  '/dr-backup': 'dr_backup.view',
  '/regions': 'regions.view',
  '/branches': 'branches.view',
  '/barcodes': 'barcodes.view',
  '/data-warehouse': 'data_warehouse.view',
  '/api-keys': 'api_keys.view',
  '/developer-portal': 'developer_portal.view',
  '/data-export': 'data_export.view',
  '/bulk-import': 'bulk_import.view',
  '/data-import-advanced': 'bulk_import.view',
  '/settings': 'settings.view',
  '/admin': 'users.view',
  '/admin/users': 'users.view',
  '/admin/roles': 'roles.view',
  '/security': 'sessions.view',
  '/audit-logs': 'audit.view',
  '/audit-logs-advanced': 'audit.view',
  '/notification-templates': 'communications.view',
  '/notification-logs': 'notifications.view',
  '/sessions': 'sessions.view',
  '/system-monitor': 'system_monitor.view',
  '/print-templates': 'settings.view',
  '/user-preferences': 'settings.view',
};
