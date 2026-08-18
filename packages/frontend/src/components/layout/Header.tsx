import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../stores/authStore';
import { useTheme } from '../../stores/themeStore';
import QuickSearch from './QuickSearch';
import { Button } from '../ui';
import { useClinicConfiguration } from '../../stores/clinicConfigurationStore';
import {
  Menu, Search, Bell, Globe, User, LogOut,
  ChevronDown, Settings, Sun, Moon, Command,
} from 'lucide-react';

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, tenant, memberships, activeMembership, switchMembership, logout, setLocale } = useAuth();
  const { identity } = useClinicConfiguration();
  const clinicDisplayName = identity?.displayName || tenant?.name || t('app.name');
  const { theme, toggleTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [switchingMembershipId, setSwitchingMembershipId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const goKeyRef = useRef<{ timeout: ReturnType<typeof setTimeout> | null }>({ timeout: null });

  useEffect(() => {
    const isTyping = (target: EventTarget | null) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes((target as HTMLElement)?.tagName) ||
      (target as HTMLElement)?.isContentEditable === true;

    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLangMenu(false);
    }

    const GO_MAP: Record<string, string> = {
      d: '/', p: '/patients', a: '/appointments', b: '/billing',
      s: '/settings', u: '/users',
    };

    function handleKey(e: KeyboardEvent) {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && !isTyping(e.target)) {
        e.preventDefault(); setShowSearch(true);
        return;
      }
      if (e.key === 't' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault(); toggleTheme();
        return;
      }
      if (e.key === 't' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); toggleTheme();
        return;
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); setShowShortcuts(true);
        return;
      }
      if (e.key === 'g' && !isTyping(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (goKeyRef.current.timeout) clearTimeout(goKeyRef.current.timeout);
        const onNext = (ev: KeyboardEvent) => {
          const target = GO_MAP[ev.key.toLowerCase()];
          if (target) { ev.preventDefault(); navigate(target); }
          document.removeEventListener('keydown', onNext);
          if (goKeyRef.current.timeout) clearTimeout(goKeyRef.current.timeout);
        };
        document.addEventListener('keydown', onNext);
        goKeyRef.current.timeout = setTimeout(() => {
          document.removeEventListener('keydown', onNext);
        }, 1200);
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      if (goKeyRef.current.timeout) clearTimeout(goKeyRef.current.timeout);
    };
  }, [toggleTheme, navigate]);

  const setLocale2 = (locale: 'ar' | 'en') => {
    i18n.changeLanguage(locale);
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
    setLocale(locale);
  };

  const isRtl = i18n.language === 'ar';

  return (
    <header className="sticky top-0 z-30 bg-[var(--surface)] border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between h-16 px-2 sm:px-4 lg:px-6 gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <div className="hidden md:flex items-center relative flex-1 max-w-xs">
            <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t('common.search') + '...'}
              className="input pl-10 w-full"
              aria-label="Search"
            />
          </div>
          <button
            className="md:hidden p-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setShowSearch(true)}
            aria-label="Open search"
          >
            <Search className="w-5 h-5 text-gray-600" />
          </button>
          <div className="hidden lg:flex items-center gap-2 min-w-0 max-w-[260px]" title={clinicDisplayName}>
            {identity?.logoUrl ? (
              <img src={identity.logoUrl} alt="" className="h-7 w-7 rounded object-contain shrink-0" />
            ) : null}
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{clinicDisplayName}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {memberships.length > 1 && (
            <select
              aria-label="Switch active membership"
              value={activeMembership?.id || ''}
              disabled={Boolean(switchingMembershipId)}
              onChange={async (event) => {
                const membershipId = event.target.value;
                if (!membershipId || membershipId === activeMembership?.id) return;
                setSwitchingMembershipId(membershipId);
                try {
                  await switchMembership(membershipId);
                } finally {
                  setSwitchingMembershipId(null);
                }
              }}
              className="hidden md:block max-w-[180px] rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.tenantId.slice(0, 8)} · {membership.branchId?.slice(0, 8) || 'Tenant'}
                </option>
              ))}
            </select>
          )}
          <div className="relative" ref={langRef}>
            <button
              onClick={() => setShowLangMenu(!showLangMenu)}
              className="p-2 rounded-lg hover:bg-gray-100 flex items-center gap-1 min-w-[44px] min-h-[44px] justify-center"
              aria-label="Change language"
            >
              <Globe className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-600 hidden sm:inline">
                {i18n.language === 'ar' ? 'AR' : 'EN'}
              </span>
            </button>
            {showLangMenu && (
              <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-32 bg-white rounded-lg shadow dark:bg-gray-900-lg border border-gray-200 py-1 z-50 dark:bg-gray-900 dark:border-gray-800`}>
                <button
                  onClick={() => setLocale2('en')}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${i18n.language === 'en' ? 'text-primary-600 font-medium' : 'text-gray-700'}`}
                >
                  🇬🇧 English
                </button>
                <button
                  onClick={() => setLocale2('ar')}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${i18n.language === 'ar' ? 'text-primary-600 font-medium' : 'text-gray-700'}`}
                >
                  🇸🇦 العربية
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => toggleTheme()}
            className="p-2 rounded-lg hover:bg-gray-100 min-w-[44px] min-h-[44px] flex items-center justify-center dark:hover:bg-gray-800"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 text-gray-300" />
            ) : (
              <Moon className="w-5 h-5 text-gray-600" />
            )}
          </button>

          <button className="p-2 rounded-lg hover:bg-gray-100 relative min-w-[44px] min-h-[44px] flex items-center justify-center dark:hover:bg-gray-800" aria-label="Notifications">
            <Bell className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 min-h-[44px]"
              aria-label="User menu"
            >
              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center shrink-0 dark:bg-primary-900/40">
                <User className="w-4 h-4 text-primary-600 dark:text-primary-300" />
              </div>
              <div className="hidden sm:block text-left min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate max-w-[120px]">{user?.email}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block shrink-0" />
            </button>

            {showUserMenu && (
              <div className={`absolute ${isRtl ? 'left-0' : 'right-0'} mt-2 w-56 bg-white rounded-lg shadow dark:bg-gray-900-lg border border-gray-200 py-1 z-50 dark:bg-gray-900 dark:border-gray-800`}>
                <div className="px-4 py-3 border-b border-gray-100 sm:hidden">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.firstName} {user?.lastName}</p>
                  <p className="text-xs text-gray-500 truncate">{user?.email}</p>
                </div>
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/user-preferences'); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <User className="w-4 h-4" /> {t('nav.userPreferences')}
                </button>
                <button
                  onClick={() => { setShowUserMenu(false); navigate('/settings'); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Settings className="w-4 h-4" /> {t('nav.settings')}
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => { setShowUserMenu(false); logout(); }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <LogOut className="w-4 h-4" /> {t('auth.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <QuickSearch open={showSearch} onClose={() => setShowSearch(false)} />

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4 dark:text-gray-100">{t('preferences.keyboardShortcuts')}</h3>
            <div className="space-y-2">
              {[
                { keys: 'g d', desc: t('nav.dashboard') },
                { keys: 'g p', desc: t('nav.patients') },
                { keys: 'g a', desc: t('nav.appointments') },
                { keys: 'g b', desc: t('nav.billing') },
                { keys: 'g u', desc: t('nav.users') },
                { keys: 'g s', desc: t('nav.settings') },
                { keys: '/', desc: t('preferences.openSearch') },
                { keys: 't', desc: t('preferences.toggleTheme') },
                { keys: '?', desc: t('preferences.showShortcuts') },
              ].map((row) => (
                <div key={row.keys} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{row.desc}</span>
                  <kbd className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 border rounded text-xs font-mono dark:text-gray-200">{row.keys}</kbd>
                </div>
              ))}
            </div>
            <Button className="w-full mt-5" onClick={() => setShowShortcuts(false)}>{t('common.close')}</Button>
          </div>
        </div>
      )}
    </header>
  );
}
