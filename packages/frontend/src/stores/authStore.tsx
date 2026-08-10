import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';
import { setAccessToken, setCsrfToken } from '../lib/api/client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  locale: 'ar' | 'en';
  status: string;
  mfaEnabled: boolean;
  passwordChangedAt?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  locale: 'ar' | 'en';
  direction: 'rtl' | 'ltr';
  settings: {
    dateFormat: string;
    currency: string;
    timezone: string;
    theme: {
      primaryColor: string;
      logo?: string;
      brandName: string;
    };
  };
}

export type PermissionScope =
  | 'self' | 'assigned_patients' | 'department' | 'branch' | 'branches' | 'tenant' | 'system';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<Record<string, unknown>>;
  register: (data: { name: string; slug: string; adminEmail: string; adminPassword: string; adminName: string; locale?: string }) => Promise<void>;
  logout: () => void;
  setLocale: (locale: 'ar' | 'en') => void;
  refreshUser: () => Promise<void>;
  /** Centralized permission check. Server remains authoritative — this is the UX mirror only. */
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await authApi.me();
      setUser(data.user);
      setTenant(data.tenant);
      setIsAuthenticated(true);
      localStorage.setItem('locale', data.user.locale);
    } catch {
      setAccessToken(null);
      setIsAuthenticated(false);
      throw new Error('Failed to refresh user');
    }
  }, []);

  // On mount, try to load user from session (cookie-based auth)
  useEffect(() => {
    authApi.me()
      .then((data) => {
        setUser(data.user);
        setTenant(data.tenant);
        setIsAuthenticated(true);
        localStorage.setItem('locale', data.user.locale);
      })
      .catch(() => {
        setAccessToken(null);
        setIsAuthenticated(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug: string): Promise<Record<string, unknown>> => {
    const data = await authApi.login({ email, password, tenantSlug });

    // If MFA is required, return partial data (no tokens yet)
    if (data.mfaRequired) {
      return { mfaRequired: true, partialToken: data.partialToken, userId: data.userId };
    }

    // Tokens set: accessToken in memory, refreshToken in HttpOnly cookie
    localStorage.setItem('tenantSlug', tenantSlug);
    localStorage.setItem('locale', data.user.locale);
    setUser(data.user);
    setTenant(data.tenant);
    setIsAuthenticated(true);
    // Pull the full principal (effective permissions/branches/employeeType)
    // from the server so the UI mirror is never empty right after login.
    authApi.me()
      .then((fresh) => {
        setUser(fresh.user);
        setTenant(fresh.tenant);
        localStorage.setItem('locale', fresh.user.locale);
      })
      .catch(() => {
        // Session is already established; keep the login payload as fallback.
      });
    return {};
  }, []);

  const register = useCallback(async (data: { name: string; slug: string; adminEmail: string; adminPassword: string; adminName: string; locale?: string }) => {
    await authApi.register(data);
  }, []);

  const logout = useCallback(() => {
    authApi.logout().catch(() => {
      // Ignore errors — clear local state regardless
    });
    setAccessToken(null);
    setCsrfToken(null);
    localStorage.removeItem('tenantSlug');
    localStorage.removeItem('locale');
    setUser(null);
    setTenant(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  }, []);

  const setLocale = useCallback((locale: 'ar' | 'en') => {
    localStorage.setItem('locale', locale);
    setUser((prev) => prev ? { ...prev, locale } : null);
  }, []);

  const can = useCallback((permission: string) => canUse(user?.permissions || [], permission), [user]);
  const canAny = useCallback((permissions: string[]) => canAnyUse(user?.permissions || [], permissions), [user]);

  return (
    <AuthContext.Provider value={{ user, tenant, isAuthenticated, isLoading, login, register, logout, setLocale, refreshUser, can, canAny }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

/**
 * Pure helper shared by the store and components. A '*' grant (super_admin)
 * passes everything; otherwise the exact `module.action` key must be present.
 * The backend is the source of truth — this only mirrors effective permissions
 * returned by /auth/me (which are derived server-side from role_permissions +
 * user_permissions).
 */
export function canUse(permissions: string[], permission: string): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}

export function canAnyUse(permissions: string[], required: string[]): boolean {
  return required.some((p) => canUse(permissions, p));
}
