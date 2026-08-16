import { useEffect, useState, useMemo, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../stores/authStore';
import {
  LayoutDashboard, Users, CalendarCheck, FileText,
  Receipt, PillBottle, FlaskConical, ScanLine,
  Package, UsersRound, BarChart3, Settings,
  Shield, X, ChevronDown, Stethoscope,
  ListOrdered, ArrowLeftRight, Home, Video,
  ScrollText, ShieldCheck, ClipboardList, GitBranch,
  Building2,
  Bot, LayoutDashboard as BiIcon, FileSpreadsheet, Puzzle,
  CreditCard, Palette, HardDrive, Globe,
  UserRound, CalendarPlus, MessageSquare,
  KeyRound, Download, Monitor,
  Upload, UserCog,
  Printer, Send, Shield as ShieldIcon,
  Zap, Barcode, Database,
  PhoneCall, MessageCircle, Star,
  Wallet, Calendar, TrendingUp, UserCheck, Heart, Smartphone, Code, User, Bell,
  Search,
} from 'lucide-react';
import { navigationApi, type NavFavorite } from '../../lib/api/navigation';
import { resolveNavLabelKey } from '../../config/nav-labels';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  permission?: string;
}

interface NavGroup {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'patient-care',
    labelKey: 'navGroup.patientCare',
    icon: Stethoscope,
    items: [
      { path: '/patients', icon: Users, labelKey: 'nav.patients', permission: 'patients.view' },
      { path: '/appointments', icon: CalendarCheck, labelKey: 'nav.appointments', permission: 'appointments.view' },
      { path: '/emr', icon: FileText, labelKey: 'nav.emr', permission: 'emr.view' },
      { path: '/queue', icon: ListOrdered, labelKey: 'nav.queue', permission: 'queue.view' },
      { path: '/referrals', icon: ArrowLeftRight, labelKey: 'nav.referrals', permission: 'referrals.view' },
      { path: '/nursing', icon: Stethoscope, labelKey: 'nav.nursing', permission: 'nursing.view' },
      { path: '/home-visits', icon: Home, labelKey: 'nav.homeVisits', permission: 'home_visits.view' },
      { path: '/telemedicine', icon: Video, labelKey: 'nav.telemedicine', permission: 'telemedicine.view' },
    ],
  },
  {
    id: 'clinical',
    labelKey: 'navGroup.clinical',
    icon: FlaskConical,
    items: [
      { path: '/laboratory', icon: FlaskConical, labelKey: 'nav.laboratory', permission: 'laboratory.view' },
      { path: '/radiology', icon: ScanLine, labelKey: 'nav.radiology', permission: 'radiology.view' },
      { path: '/pharmacy', icon: PillBottle, labelKey: 'nav.pharmacy', permission: 'pharmacy.view' },
    ],
  },
  {
    id: 'financial',
    labelKey: 'navGroup.financial',
    icon: Receipt,
    items: [
      { path: '/billing', icon: Receipt, labelKey: 'nav.billing', permission: 'billing.view' },
      { path: '/insurance', icon: ShieldCheck, labelKey: 'nav.insurance', permission: 'insurance.view' },
      { path: '/insurance-claims', icon: ShieldCheck, labelKey: 'nav.insuranceClaims', permission: 'insurance_claims.view' },
      { path: '/expenses', icon: Wallet, labelKey: 'nav.expenseTracking', permission: 'expenses.view' },
      { path: '/eta-invoicing', icon: FileText, labelKey: 'nav.etaInvoicing', permission: 'eta_invoicing.view' },
    ],
  },
  {
    id: 'operations',
    labelKey: 'navGroup.operations',
    icon: Package,
    items: [
      { path: '/inventory', icon: Package, labelKey: 'nav.inventory', permission: 'inventory.view' },
      { path: '/hr', icon: UsersRound, labelKey: 'nav.hr', permission: 'hr.view' },
      { path: '/crm', icon: BarChart3, labelKey: 'nav.crm', permission: 'crm.view' },
      { path: '/dms', icon: FileText, labelKey: 'nav.dms', permission: 'documents.view' },
      { path: '/workflow', icon: GitBranch, labelKey: 'nav.workflow', permission: 'workflow.view' },
      { path: '/forms', icon: ClipboardList, labelKey: 'nav.forms', permission: 'forms.view' },
      { path: '/compliance', icon: ScrollText, labelKey: 'nav.compliance', permission: 'compliance.view' },
      { path: '/automation', icon: Zap, labelKey: 'nav.automation', permission: 'automation.view' },
    ],
  },
  {
    id: 'analytics',
    labelKey: 'navGroup.analytics',
    icon: BarChart3,
    items: [
      { path: '/bi', icon: BiIcon, labelKey: 'nav.bi', permission: 'bi.view' },
      { path: '/reports', icon: FileSpreadsheet, labelKey: 'nav.reports', permission: 'reports.view' },
      { path: '/financial-reports', icon: BarChart3, labelKey: 'nav.financialReports', permission: 'financial_reports.view' },
      { path: '/compliance-reports', icon: Shield, labelKey: 'nav.complianceReports', permission: 'compliance_reports.view' },
      { path: '/advanced-reporting', icon: FileText, labelKey: 'nav.advancedReporting', permission: 'advanced_reporting.view' },
      { path: '/analytics-dashboard', icon: BarChart3, labelKey: 'nav.analyticsDashboard', permission: 'analytics_dashboard.view' },
    ],
  },
  {
    id: 'ai',
    labelKey: 'navGroup.ai',
    icon: Bot,
    items: [
      { path: '/ai-hub', icon: Bot, labelKey: 'nav.aiHub', permission: 'ai_hub.view' },
      { path: '/clinical-ai', icon: Bot, labelKey: 'nav.clinicalAI', permission: 'clinical_ai.view' },
      { path: '/predictive-analytics', icon: TrendingUp, labelKey: 'nav.predictiveAnalytics', permission: 'predictive_analytics.view' },
      { path: '/smart-scheduling', icon: Calendar, labelKey: 'nav.smartScheduling', permission: 'smart_scheduling.view' },
    ],
  },
  {
    id: 'communication',
    labelKey: 'navGroup.communication',
    icon: MessageSquare,
    items: [
      { path: '/notifications', icon: Bell, labelKey: 'nav.notifications', permission: 'notifications.view' },
      { path: '/communications', icon: Send, labelKey: 'nav.communications', permission: 'communications.view' },
      { path: '/whatsapp', icon: MessageCircle, labelKey: 'nav.whatsapp', permission: 'whatsapp.view' },
      { path: '/whatsapp-templates', icon: MessageCircle, labelKey: 'nav.whatsappTemplates', permission: 'whatsapp.view' },
      { path: '/voice-calls', icon: PhoneCall, labelKey: 'nav.voiceCalls', permission: 'voice_calls.view' },
      { path: '/chat', icon: MessageSquare, labelKey: 'nav.chat', permission: 'chat.view' },
      { path: '/patient-messages', icon: MessageSquare, labelKey: 'nav.patientMessages', permission: 'patient_messages.view' },
    ],
  },
  {
    id: 'patient-experience',
    labelKey: 'navGroup.patientExperience',
    icon: Heart,
    items: [
      { path: '/patient-portal', icon: UserRound, labelKey: 'nav.patientPortal', permission: 'patient_portal.view' },
      { path: '/online-booking', icon: CalendarPlus, labelKey: 'nav.onlineBooking', permission: 'online_booking.view' },
      { path: '/patient-app', icon: Smartphone, labelKey: 'nav.patientApp', permission: 'patient_self_service.view' },
      { path: '/patient-self-service', icon: User, labelKey: 'nav.patientSelfService', permission: 'patient_self_service.view' },
      { path: '/post-visit-survey', icon: Heart, labelKey: 'nav.postVisitSurvey', permission: 'crm.view' },
      { path: '/kiosk', icon: UserCheck, labelKey: 'nav.kiosk', permission: 'queue.view' },
      { path: '/queue-display', icon: ListOrdered, labelKey: 'nav.queueDisplay', permission: 'queue.view' },
    ],
  },
  {
    id: 'platform',
    labelKey: 'navGroup.platform',
    icon: Puzzle,
    items: [
      { path: '/saas-billing', icon: CreditCard, labelKey: 'nav.saasBilling', permission: 'saas_billing.view' },
      { path: '/white-label', icon: Palette, labelKey: 'nav.whiteLabel', permission: 'white_label.view' },
      { path: '/integrations', icon: Puzzle, labelKey: 'nav.integrations', permission: 'integrations.view' },
      { path: '/dr-backup', icon: HardDrive, labelKey: 'nav.drBackup', permission: 'dr_backup.view' },
      { path: '/regions', icon: Globe, labelKey: 'nav.regions', permission: 'regions.view' },
      { path: '/branches', icon: Building2, labelKey: 'nav.multiBranch', permission: 'branches.view' },
      { path: '/barcodes', icon: Barcode, labelKey: 'nav.barcodes', permission: 'barcodes.view' },
      { path: '/data-warehouse', icon: Database, labelKey: 'nav.dataWarehouse', permission: 'data_warehouse.view' },
    ],
  },
  {
    id: 'developer',
    labelKey: 'navGroup.developer',
    icon: Code,
    items: [
      { path: '/api-keys', icon: KeyRound, labelKey: 'nav.apiKeys', permission: 'api_keys.view' },
      { path: '/developer-portal', icon: Code, labelKey: 'nav.developerPortal', permission: 'developer_portal.view' },
      { path: '/data-export', icon: Download, labelKey: 'nav.dataExport', permission: 'data_export.view' },
      { path: '/bulk-import', icon: Upload, labelKey: 'nav.bulkImport', permission: 'bulk_import.view' },
      { path: '/data-import-advanced', icon: Upload, labelKey: 'nav.dataImport', permission: 'bulk_import.view' },
    ],
  },
];

const secondaryItems: NavItem[] = [
  { path: '/settings', icon: Settings, labelKey: 'nav.settings', permission: 'settings.view' },
  { path: '/admin', icon: Shield, labelKey: 'nav.admin', permission: 'users.view' },
  { path: '/security', icon: Shield, labelKey: 'nav.security', permission: 'sessions.view' },
  { path: '/audit-logs', icon: ClipboardList, labelKey: 'nav.auditLogs', permission: 'audit.view' },
  { path: '/audit-logs-advanced', icon: ClipboardList, labelKey: 'nav.auditLogsAdvanced', permission: 'audit.view' },
  { path: '/notification-templates', icon: MessageSquare, labelKey: 'nav.notificationTemplates', permission: 'communications.view' },
  { path: '/notification-logs', icon: Send, labelKey: 'nav.notificationLogs', permission: 'notifications.view' },
  { path: '/sessions', icon: ShieldIcon, labelKey: 'nav.sessions', permission: 'sessions.view' },
  { path: '/system-monitor', icon: Monitor, labelKey: 'nav.systemMonitor', permission: 'system_monitor.view' },
  { path: '/print-templates', icon: Printer, labelKey: 'nav.printTemplates', permission: 'settings.view' },
  { path: '/user-preferences', icon: UserCog, labelKey: 'nav.userPreferences', permission: 'settings.view' },
];

function SidebarGroup({
  group,
  isExpanded,
  onToggle,
  t,
  location,
  onNavigate,
  favorites,
  onToggleFavorite,
}: {
  group: NavGroup;
  isExpanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
  location: ReturnType<typeof useLocation>;
  onNavigate: () => void;
  favorites: NavFavorite[];
  onToggleFavorite: (path: string, label: string) => void;
}) {
  const hasActiveChild = group.items.some((item) =>
    location.pathname === item.path || location.pathname.startsWith(item.path + '/')
  );

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
          hasActiveChild && !isExpanded
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
        }`}
      >
        <group.icon className="w-5 h-5 shrink-0" />
        <span className="flex-1 text-left truncate">{t(group.labelKey)}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isExpanded && (
        <div className="ml-4 pl-3 border-l border-gray-200 mt-1 space-y-0.5 dark:border-gray-800">
          {group.items.map((item) => (
            <div key={item.path} className="group flex items-center rounded-lg">
              <NavLink
                to={item.path}
                end={item.path === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors min-h-[40px] flex-1 min-w-0 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                  }`
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </NavLink>
              <button
                type="button"
                aria-label={favorites.some((f) => f.path === item.path) ? 'Remove favorite' : 'Add favorite'}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(item.path, t(item.labelKey)); }}
                className={`p-1.5 rounded-md shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                  favorites.some((f) => f.path === item.path)
                    ? 'text-amber-500 opacity-100'
                    : 'text-gray-400 hover:text-amber-500'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${favorites.some((f) => f.path === item.path) ? 'fill-current' : ''}`} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { tenant, can } = useAuth();
  const location = useLocation();
  const isRtl = i18n.language === 'ar';

  const visibleGroups = useMemo(() => {
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.permission || can(item.permission)),
      }))
      .filter((group) => group.items.length > 0);
  }, [can]);

  const visibleSecondary = useMemo(
    () => secondaryItems.filter((item) => !item.permission || can(item.permission)),
    [can],
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const group of navGroups) {
      if (group.items.some((item) => location.pathname.startsWith(item.path))) {
        initial.add(group.id);
      }
    }
    return initial;
  });

  const [search, setSearch] = useState('');
  const [showSecondary, setShowSecondary] = useState(false);
  const [favorites, setFavorites] = useState<NavFavorite[]>([]);

  const allNavItems = useMemo(() => {
    const map = new Map<string, NavItem>();
    for (const group of navGroups) {
      for (const item of group.items) map.set(item.path, item);
    }
    for (const item of secondaryItems) map.set(item.path, item);
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const favs = await navigationApi.favorites();
        if (!cancelled) setFavorites(favs);
      } catch {
        // Personalization is best-effort; the sidebar works without it.
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const toggleFavorite = useCallback((path: string, label: string) => {
    const existing = favorites.find((f) => f.path === path);
    if (existing) {
      void navigationApi.removeFavorite(existing.id)
        .then(() => setFavorites((prev) => prev.filter((f) => f.id !== existing.id)))
        .catch(() => undefined);
    } else {
      void navigationApi.addFavorite(path, label)
        .then(() => navigationApi.favorites())
        .then(setFavorites)
        .catch(() => undefined);
    }
  }, [favorites]);

  const toggleGroup = useCallback((id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedGroups(new Set(navGroups.map((g) => g.id)));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return visibleGroups;
    const q = search.toLowerCase();
    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            t(item.labelKey).toLowerCase().includes(q) ||
            item.path.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [search, t]);

  const filteredSecondary = useMemo(() => {
    if (!search.trim()) return visibleSecondary;
    const q = search.toLowerCase();
    return visibleSecondary.filter(
      (item) =>
        t(item.labelKey).toLowerCase().includes(q) ||
        item.path.toLowerCase().includes(q)
    );
  }, [search, t]);

  const totalItems = visibleGroups.reduce((sum, g) => sum + g.items.length, 0);

  const handleNavigate = useCallback(() => {
    onClose();
    setSearch('');
  }, [onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed top-0 bottom-0 z-50 w-64 bg-[var(--sidebar)] border-gray-200 dark:border-gray-800
          flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:z-40
          ${isRtl ? 'right-0 translate-x-full border-l' : 'left-0 -translate-x-full border-r'}
          ${open ? 'translate-x-0' : ''}
        `}
        aria-label="Sidebar navigation"
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 shrink-0 dark:border-gray-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 truncate text-sm dark:text-gray-100">
              {tenant?.settings?.theme?.brandName || t('app.name')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2.5 border-b border-gray-100 shrink-0 dark:border-gray-800">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input
              type="text"
              placeholder={t('sidebar.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 placeholder-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-xs text-gray-400">
              {search
                ? `${filteredGroups.reduce((s, g) => s + g.items.length, 0) + filteredSecondary.length} ${t('sidebar.results')}`
                : `${totalItems + secondaryItems.length} ${t('sidebar.modules')}`}
            </span>
            <div className="flex gap-1">
              <button onClick={expandAll} className="text-xs text-primary-600 hover:text-primary-700">
                {t('sidebar.expandAll')}
              </button>
              <span className="text-gray-300">|</span>
              <button onClick={collapseAll} className="text-xs text-primary-600 hover:text-primary-700">
                {t('sidebar.collapseAll')}
              </button>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-0.5">
          {/* Dashboard (standalone) */}
          {!search.trim() && (
            <div className="group flex items-center">
              <NavLink
                to="/"
                end
                onClick={handleNavigate}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors min-h-[44px] flex-1 min-w-0 ${
                    isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`
                }
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <span>{t('nav.dashboard')}</span>
              </NavLink>
              <button
                type="button"
                aria-label={favorites.some((f) => f.path === '/') ? 'Remove favorite' : 'Add favorite'}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite('/', t('nav.dashboard')); }}
                className={`p-1.5 rounded-md shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                  favorites.some((f) => f.path === '/')
                    ? 'text-amber-500 opacity-100'
                    : 'text-gray-400 hover:text-amber-500'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${favorites.some((f) => f.path === '/') ? 'fill-current' : ''}`} />
              </button>
            </div>
          )}

          {/* Favorites */}
          {!search.trim() && favorites.length > 0 && (
            <div className="pt-3 mt-1 border-t border-gray-100">
              <p className="px-3 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">{t('sidebar.favorites')}</p>
              <div className="space-y-0.5">
                {favorites.map((fav) => {
                  const item = allNavItems.get(fav.path);
                  const Icon = item?.icon ?? Star;
                  return (
                    <NavLink
                      key={fav.id}
                      to={fav.path}
                      end={fav.path === '/'}
                      onClick={handleNavigate}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors min-h-[40px] ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate flex-1">{item ? t(item.labelKey) : fav.label}</span>
                      <Star className="w-3 h-3 text-amber-500 fill-current shrink-0" />
                    </NavLink>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grouped nav items */}
          {filteredGroups.map((group) => (
            <SidebarGroup
              key={group.id}
              group={group}
              isExpanded={search.trim() ? true : expandedGroups.has(group.id)}
              onToggle={() => toggleGroup(group.id)}
              t={t}
              location={location}
              onNavigate={handleNavigate}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          ))}

          {/* Secondary items (Settings/Admin) */}
          {filteredSecondary.length > 0 && (
            <div className="pt-3 mt-3 border-t border-gray-200">
              <button
                onClick={() => setShowSecondary((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors min-h-[44px] text-gray-700 hover:bg-gray-100"
              >
                <Settings className="w-5 h-5 shrink-0" />
                <span className="flex-1 text-left truncate">{t('nav.settings')}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                    showSecondary ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {(showSecondary || !!search.trim()) && (
                <div className="ml-4 pl-3 border-l border-gray-200 mt-1 space-y-0.5 dark:border-gray-800">
                  {filteredSecondary.map((item) => (
                    <div key={item.path} className="group flex items-center rounded-lg">
                      <NavLink
                        to={item.path}
                        onClick={handleNavigate}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors min-h-[40px] flex-1 min-w-0 ${
                            isActive
                              ? 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/30 dark:text-primary-300'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
                          }`
                        }
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </NavLink>
                      <button
                        type="button"
                        aria-label={favorites.some((f) => f.path === item.path) ? 'Remove favorite' : 'Add favorite'}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.path, t(item.labelKey)); }}
                        className={`p-1.5 rounded-md shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity ${
                          favorites.some((f) => f.path === item.path)
                            ? 'text-amber-500 opacity-100'
                            : 'text-gray-400 hover:text-amber-500'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${favorites.some((f) => f.path === item.path) ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
