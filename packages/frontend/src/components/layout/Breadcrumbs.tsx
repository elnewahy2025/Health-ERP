import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { resolveNavLabelKey } from '../../config/nav-labels';

export default function Breadcrumbs() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const isRtl = i18n.language === 'ar';
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return null;

  const rootKey = resolveNavLabelKey(`/${segments[0]}`);
  if (!rootKey) return null;

  const hasDetail = segments.length > 1;
  const chevron = (
    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 shrink-0 ${isRtl ? 'rotate-180' : ''}`} />
  );

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap dark:text-gray-400">
        <li>
          <Link to="/" className="hover:text-primary-600">
            {t('nav.dashboard')}
          </Link>
        </li>
        {chevron}
        {hasDetail ? (
          <>
            <li>
              <Link to={`/${segments[0]}`} className="hover:text-primary-600">
                {t(rootKey)}
              </Link>
            </li>
            {chevron}
            <li aria-current="page" className="font-medium text-gray-900 dark:text-gray-100">
              {t('common.view')}
            </li>
          </>
        ) : (
          <li aria-current="page" className="font-medium text-gray-900">
            {t(rootKey)}
          </li>
        )}
      </ol>
    </nav>
  );
}
