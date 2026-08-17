import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './stores/authStore';
import { ThemeProvider } from './stores/themeStore';
import { useTranslation } from 'react-i18next';
import DashboardLayout from './layouts/DashboardLayout';
import { ErrorBoundary, PageLoader } from './components/ui';
import { Shield } from 'lucide-react';
import { useDirection } from './hooks/useDirection';
import { routePermissions } from './router';
import { ProtectedRoute as AuthorizationProtectedRoute } from './components/auth/Authorization';

// Lazy-loaded page components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PublicPortalPage = lazy(() => import('./pages/PublicPortalPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const PatientsPage = lazy(() => import('./pages/PatientsPage'));
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const EmrPage = lazy(() => import('./pages/EmrPage'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const LaboratoryPage = lazy(() => import('./pages/LaboratoryPage'));
const RadiologyPage = lazy(() => import('./pages/RadiologyPage'));
const PharmacyPage = lazy(() => import('./pages/PharmacyPage'));
const QueuePage = lazy(() => import('./pages/QueuePage'));
const ReferralsPage = lazy(() => import('./pages/ReferralsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const NursingPage = lazy(() => import('./pages/NursingPage'));
const HomeVisitsPage = lazy(() => import('./pages/HomeVisitsPage'));
const TelemedicinePage = lazy(() => import('./pages/TelemedicinePage'));
const InsurancePage = lazy(() => import('./pages/InsurancePage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const HrPage = lazy(() => import('./pages/HrPage'));
const CrmPage = lazy(() => import('./pages/CrmPage'));
const DmsPage = lazy(() => import('./pages/DmsPage'));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage'));
const FormsPage = lazy(() => import('./pages/FormsPage'));
const CompliancePage = lazy(() => import('./pages/CompliancePage'));
const AiHubPage = lazy(() => import('./pages/AiHubPage'));
const BiPage = lazy(() => import('./pages/BiPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'));
const SaasBillingPage = lazy(() => import('./pages/SaasBillingPage'));
const WhiteLabelPage = lazy(() => import('./pages/WhiteLabelPage'));
const ComplianceReportsPage = lazy(() => import('./pages/ComplianceReportsPage'));
const DrBackupPage = lazy(() => import('./pages/DrBackupPage'));
const RegionsPage = lazy(() => import('./pages/RegionsPage'));
const PatientPortalPage = lazy(() => import('./pages/PatientPortalPage'));
const OnlineBookingPage = lazy(() => import('./pages/OnlineBookingPage'));
const PatientMessagesPage = lazy(() => import('./pages/PatientMessagesPage'));
const ApiKeysPage = lazy(() => import('./pages/ApiKeysPage'));
const DataExportPage = lazy(() => import('./pages/DataExportPage'));
const SystemMonitorPage = lazy(() => import('./pages/SystemMonitorPage'));
const BulkImportPage = lazy(() => import('./pages/BulkImportPage'));
const UserPreferencesPage = lazy(() => import('./pages/UserPreferencesPage'));
const PrintTemplatesPage = lazy(() => import('./pages/PrintTemplatesPage'));
const CommunicationsPage = lazy(() => import('./pages/CommunicationsPage'));
const SessionsPage = lazy(() => import('./pages/SessionsPage'));
const AutomationPage = lazy(() => import('./pages/AutomationPage'));
const BarcodesPage = lazy(() => import('./pages/BarcodesPage'));
const DataWarehousePage = lazy(() => import('./pages/DataWarehousePage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SecuritySettingsPage = lazy(() => import('./pages/SecuritySettingsPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const NotificationTemplatesPage = lazy(() => import('./pages/NotificationTemplatesPage'));
const NotificationLogsPage = lazy(() => import('./pages/NotificationLogsPage'));
const FinancialReportsPage = lazy(() => import('./pages/FinancialReportsPage'));
const InsuranceClaimsPage = lazy(() => import('./pages/InsuranceClaimsPage'));
const PatientTimelinePage = lazy(() => import('./pages/PatientTimelinePage'));
const WhatsAppPage = lazy(() => import('./pages/WhatsAppPage'));
const VoiceCallsPage = lazy(() => import('./pages/VoiceCallsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ExpenseTrackingPage = lazy(() => import('./pages/ExpenseTrackingPage'));
const EtaInvoicingPage = lazy(() => import('./pages/EtaInvoicingPage'));
const ClinicalAIPage = lazy(() => import('./pages/ClinicalAIPage'));
const PredictiveAnalyticsPage = lazy(() => import('./pages/PredictiveAnalyticsPage'));
const SmartSchedulingPage = lazy(() => import('./pages/SmartSchedulingPage'));
const KioskCheckinPage = lazy(() => import('./pages/KioskCheckinPage'));
const QueueDisplayPage = lazy(() => import('./pages/QueueDisplayPage'));
const PostVisitSurveyPage = lazy(() => import('./pages/PostVisitSurveyPage'));
const PatientMobileAppPage = lazy(() => import('./pages/PatientMobileAppPage'));
const WhatsAppTemplatesPage = lazy(() => import('./pages/WhatsAppTemplatesPage'));
const DataImportPage = lazy(() => import('./pages/DataImportPage'));
const AuditLogsAdvancedPage = lazy(() => import('./pages/AuditLogsAdvancedPage'));
const MultiBranchPage = lazy(() => import('./pages/MultiBranchPage'));
const BranchDetailPage = lazy(() => import('./pages/BranchDetailPage'));
const AnalyticsDashboardPage = lazy(() => import('./pages/AnalyticsDashboardPage'));
const PatientSelfServicePage = lazy(() => import('./pages/PatientSelfServicePage'));
const PharmacyAdvancedPage = lazy(() => import('./pages/PharmacyAdvancedPage'));
const InsuranceClaimsLifecyclePage = lazy(() => import('./pages/InsuranceClaimsLifecyclePage'));
const AdvancedReportingPage = lazy(() => import('./pages/AdvancedReportingPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const DeveloperPortalPage = lazy(() => import('./pages/DeveloperPortalPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PermissionDenied() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
      <Shield className="w-12 h-12 text-gray-300 mb-4" />
      <h2 className="text-xl font-semibold text-gray-800 mb-2">You don't have access to this page</h2>
      <p className="text-gray-500 text-sm mb-6">Your account doesn't include permission to view this module. Contact your administrator if you believe this is a mistake.</p>
      <Link to="/" className="text-primary-600 hover:text-primary-700 text-sm font-medium">Back to dashboard</Link>
    </div>
  );
}

function resolveRoutePermission(pathname: string): string | undefined {
  if (routePermissions[pathname]) return routePermissions[pathname];
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 1) {
    return routePermissions[`/${segments[0]}`];
  }
  return undefined;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const required = resolveRoutePermission(location.pathname);
  return (
    <AuthorizationProtectedRoute permission={required}>
      {children}
    </AuthorizationProtectedRoute>
  );
}

function AppContent() {
  useDirection();
  const { user, tenant } = useAuth();
  const { i18n } = useTranslation();

  useEffect(() => {
    const locale = user?.locale || localStorage.getItem('locale') || 'en';
    i18n.changeLanguage(locale);

    const dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;

    if (tenant) {
      const theme = tenant.settings?.theme;
      if (theme?.primaryColor) {
        // White-label branding feeds the semantic primary tokens so every
        // component (Tailwind palette + CSS variables) follows the tenant brand.
        const hex = theme.primaryColor;
        const m = hex.match(/^#?([0-9a-f]{6})$/i);
        if (m) {
          const r = parseInt(m[1].slice(0, 2), 16);
          const g = parseInt(m[1].slice(2, 4), 16);
          const b = parseInt(m[1].slice(4, 6), 16);
          const triplet = `${r} ${g} ${b}`;
          const root = document.documentElement;
          root.style.setProperty('--primary', hex);
          root.style.setProperty('--link', hex);
          root.style.setProperty('--primary-600', triplet);
          root.style.setProperty('--primary-500', triplet);
          const darken = (v: number) => Math.max(0, Math.round(v * 0.86));
          root.style.setProperty('--primary-700', `${darken(r)} ${darken(g)} ${darken(b)}`);
          root.style.setProperty('--primary-hover', `rgb(${triplet})`);
        }
      }
    }
  }, [user, tenant, i18n]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
          <Route path="/portal" element={<PublicPortalPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/" replace />} />
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="patients" element={<PatientsPage />} />
            <Route path="patients/:id" element={<PatientDetailPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="emr" element={<EmrPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="laboratory" element={<LaboratoryPage />} />
            <Route path="radiology" element={<RadiologyPage />} />
            <Route path="pharmacy" element={<PharmacyPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="referrals" element={<ReferralsPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="nursing" element={<NursingPage />} />
            <Route path="home-visits" element={<HomeVisitsPage />} />
            <Route path="telemedicine" element={<TelemedicinePage />} />
            <Route path="insurance" element={<InsurancePage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="hr" element={<HrPage />} />
            <Route path="crm" element={<CrmPage />} />
            <Route path="dms" element={<DmsPage />} />
            <Route path="workflow" element={<WorkflowPage />} />
            <Route path="forms" element={<FormsPage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="ai-hub" element={<AiHubPage />} />
            <Route path="bi" element={<BiPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="saas-billing" element={<SaasBillingPage />} />
            <Route path="white-label" element={<WhiteLabelPage />} />
            <Route path="compliance-reports" element={<ComplianceReportsPage />} />
            <Route path="dr-backup" element={<DrBackupPage />} />
            <Route path="regions" element={<RegionsPage />} />
            <Route path="patient-portal" element={<PatientPortalPage />} />
            <Route path="online-booking" element={<OnlineBookingPage />} />
            <Route path="patient-messages" element={<PatientMessagesPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="barcodes" element={<BarcodesPage />} />
            <Route path="data-warehouse" element={<DataWarehousePage />} />
            <Route path="api-keys" element={<ApiKeysPage />} />
            <Route path="data-export" element={<DataExportPage />} />
            <Route path="system-monitor" element={<SystemMonitorPage />} />
            <Route path="bulk-import" element={<BulkImportPage />} />
            <Route path="user-preferences" element={<UserPreferencesPage />} />
            <Route path="print-templates" element={<PrintTemplatesPage />} />
            <Route path="communications" element={<CommunicationsPage />} />
            <Route path="whatsapp" element={<WhatsAppPage />} />
            <Route path="voice-calls" element={<VoiceCallsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="expenses" element={<ExpenseTrackingPage />} />
            <Route path="eta-invoicing" element={<EtaInvoicingPage />} />
            <Route path="clinical-ai" element={<ClinicalAIPage />} />
            <Route path="predictive-analytics" element={<PredictiveAnalyticsPage />} />
            <Route path="smart-scheduling" element={<SmartSchedulingPage />} />
            <Route path="kiosk" element={<KioskCheckinPage />} />
            <Route path="queue-display" element={<QueueDisplayPage />} />
            <Route path="post-visit-survey" element={<PostVisitSurveyPage />} />
            <Route path="patient-app" element={<PatientMobileAppPage />} />
            <Route path="sessions" element={<SessionsPage />} />
            <Route path="whatsapp-templates" element={<WhatsAppTemplatesPage />} />
            <Route path="data-import-advanced" element={<DataImportPage />} />
            <Route path="audit-logs-advanced" element={<AuditLogsAdvancedPage />} />
            <Route path="branches" element={<MultiBranchPage />} />
            <Route path="branches/:id" element={<BranchDetailPage />} />
            <Route path="analytics-dashboard" element={<AnalyticsDashboardPage />} />
            <Route path="patient-self-service" element={<PatientSelfServicePage />} />
            <Route path="pharmacy-advanced" element={<PharmacyAdvancedPage />} />
            <Route path="insurance-claims-lifecycle" element={<InsuranceClaimsLifecyclePage />} />
            <Route path="advanced-reporting" element={<AdvancedReportingPage />} />
            <Route path="developer-portal" element={<DeveloperPortalPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="admin/users" element={<UsersPage />} />
            <Route path="admin/roles" element={<RolesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="security" element={<SecuritySettingsPage />} />
            <Route path="notification-templates" element={<NotificationTemplatesPage />} />
            <Route path="notification-logs" element={<NotificationLogsPage />} />
            <Route path="audit-logs" element={<AuditLogsPage />} />
            <Route path="financial-reports" element={<FinancialReportsPage />} />
            <Route path="insurance-claims" element={<InsuranceClaimsPage />} />
            <Route path="patients/:patientId/timeline" element={<PatientTimelinePage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
