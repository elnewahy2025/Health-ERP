import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../stores/authStore';

export interface CanProps {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

/** UX-only gate; the backend remains the security authority. */
export function Can({ permission, anyOf, children, fallback = null }: CanProps) {
  const { can, canAny } = useAuth();
  const allowed = permission ? can(permission) : anyOf ? canAny(anyOf) : false;
  return allowed ? <>{children}</> : <>{fallback}</>;
}

export function ProtectedRoute({
  permission,
  anyOf,
  children,
}: {
  permission?: string;
  anyOf?: string[];
  children: ReactNode;
}) {
  const { isAuthenticated, isLoading, can, canAny } = useAuth();
  if (isLoading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (permission && !can(permission)) return <Navigate to="/forbidden" replace />;
  if (anyOf && !canAny(anyOf)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}

export interface PermissionMenuItem {
  permission?: string;
  children?: PermissionMenuItem[];
  [key: string]: unknown;
}

export function filterMenu<T extends PermissionMenuItem>(items: T[], can: (permission: string) => boolean): T[] {
  return items
    .filter((item) => !item.permission || can(item.permission))
    .map((item) => item.children
      ? { ...item, children: filterMenu(item.children, can) }
      : item)
    .filter((item) => !item.children || item.children.length > 0 || Boolean(item.permission));
}
