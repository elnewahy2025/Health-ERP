import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import Breadcrumbs from '../components/layout/Breadcrumbs';
import MobileBottomNav from '../components/layout/MobileBottomNav';
import { SkipToContent, PageTransition, ErrorBoundary } from '../components/ui';
import { navigationApi } from '../lib/api/navigation';
import { resolveNavLabelKey } from '../config/nav-labels';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { i18n, t } = useTranslation();
  const isRtl = i18n.language === 'ar';

  // Track recent pages for the navigation "Recent" section (best-effort).
  useEffect(() => {
    const labelKey = resolveNavLabelKey(location.pathname);
    if (labelKey) {
      void navigationApi.logVisit(location.pathname, t(labelKey)).catch(() => undefined);
    }
  }, [location.pathname, t]);

  return (
    <div className="min-h-screen bg-gray-50 pb-16 lg:pb-0 dark:bg-gray-950">
      <SkipToContent />
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className={`${isRtl ? "lg:mr-64" : "lg:ml-64"} relative flex flex-col min-h-screen`}>
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8" tabIndex={-1}>
          <Breadcrumbs />
          <ErrorBoundary key={location.pathname}>
            <PageTransition>
              <Outlet />
            </PageTransition>
          </ErrorBoundary>
        </main>
      </div>
      <MobileBottomNav onMenuClick={() => setSidebarOpen(true)} />
    </div>
  );
}
