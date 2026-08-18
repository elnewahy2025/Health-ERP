import { apiClient } from './client';

export interface UserListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeType: string;
  departmentId: string | null;
  position: string | null;
  status: string;
  locale: string;
  mfaEnabled: boolean;
  roles: string[];
  branches: string[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends Omit<UserListItem, 'roles' | 'branches'> {
  roles: Array<{ slug: string; name: string; level: string }>;
  branches: Array<{ id: string; name: string; code: string }>;
  department: { id: string; name: string; code: string } | null;
  professionalInfo: Record<string, unknown> | null;
  sessions: Array<{
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    device: string | null;
    location: string | null;
    last_activity_at: string;
    expires_at: string;
  }>;
  passwordChangedAt: string | null;
}

export interface RoleGrant {
  permission: string;
  scope: string;
}

export interface RoleItem {
  id?: string;
  name: string;
  slug: string;
  level: string;
  scopeDefault: string;
  description: string | null;
  isSystem?: boolean;
  grants: RoleGrant[];
}

export const usersApi = {
  list: (params: Record<string, string | number | undefined>) =>
    apiClient.get('/users', { params }).then((r) => r.data),
  get: (userId: string) => apiClient.get(`/users/${userId}`).then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    apiClient.post('/users', payload).then((r) => r.data.data),
  update: (userId: string, payload: Record<string, unknown>) =>
    apiClient.put(`/users/${userId}`, payload).then((r) => r.data.data),
  setStatus: (userId: string, status: string) =>
    apiClient.put(`/users/${userId}/status`, { status }).then((r) => r.data.data),
  resetPassword: (userId: string) =>
    apiClient.post(`/users/${userId}/reset-password`).then((r) => r.data.data),
  forceLogout: (userId: string) =>
    apiClient.post(`/users/${userId}/force-logout`).then((r) => r.data.data),
  audit: (userId: string, page = 1, limit = 20) =>
    apiClient.get(`/users/${userId}/audit`, { params: { page, limit } }).then((r) => r.data.data),
  updatePermissions: (userId: string, payload: { roles?: string[]; permissions?: string[] }) =>
    apiClient.put(`/rbac/users/${userId}/permissions`, payload).then((r) => r.data.data),
  getUserPermissions: (userId: string) =>
    apiClient.get(`/rbac/users/${userId}/permissions`).then((r) => r.data.data),
};

export const rolesApi = {
  list: () => apiClient.get('/rbac/roles').then((r) => r.data.data),
  permissions: () => apiClient.get('/rbac/permissions').then((r) => r.data.data),
  create: (payload: Record<string, unknown>) =>
    apiClient.post('/rbac/roles', payload).then((r) => r.data.data),
  update: (roleId: string, payload: Record<string, unknown>) =>
    apiClient.put(`/rbac/roles/${roleId}`, payload).then((r) => r.data.data),
  remove: (roleId: string) =>
    apiClient.delete(`/rbac/roles/${roleId}`).then((r) => r.data.data),
};

export const branchesApi = {
  list: () => apiClient.get('/branches').then((r) => r.data.data),
};

export const departmentsApi = {
  list: () => apiClient.get('/departments').then((r) => r.data.data),
  create: (payload: { name: string; code: string }) => apiClient.post('/departments', payload).then((r) => r.data.data),
  update: (departmentId: string, payload: { name?: string; code?: string; isActive?: boolean }) => apiClient.put(`/departments/${departmentId}`, payload).then((r) => r.data.data),
  remove: (departmentId: string) => apiClient.delete(`/departments/${departmentId}`).then((r) => r.data.data),
};
