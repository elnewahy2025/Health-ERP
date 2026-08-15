import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarCheck, Receipt,
  Menu,
} from 'lucide-react';
import clsx from 'clsx';

const mobileNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Home' },
  { path: '/patients', icon: Users, label: 'Patients' },
  { path: '/appointments', icon: CalendarCheck, label: 'Appts' },
  { path: '/billing', icon: Receipt, label: 'Billing' },
];

interface MobileBottomNavProps {
  onMenuClick: () => void;
}

export default function MobileBottomNav({ onMenuClick }: MobileBottomNavProps) {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 lg:hidden safe-area-bottom dark:bg-gray-900 dark:border-gray-800" role="navigation" aria-label="Mobile navigation">
      <div className="flex items-center justify-around h-16">
        {mobileNavItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={clsx(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-0 rounded-lg transition-colors',
                isActive
                  ? 'text-primary-600'
                  : 'text-gray-500 hover:text-gray-700'
              )}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-0 rounded-lg text-gray-500 hover:text-gray-700"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Menu</span>
        </button>
      </div>
    </nav>
  );
}
