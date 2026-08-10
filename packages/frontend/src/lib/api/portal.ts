import { apiClient } from './client';

/** Public patient portal (no staff session required). */
export const portalApi = {
  requestAccess: (payload: Record<string, unknown>) =>
    apiClient.post('/portal/request-access', payload).then((r) => r.data.data),
  requestOtp: (payload: { tenantSlug: string; countryCode: string; phone: string }) =>
    apiClient.post('/portal/otp/request', payload).then((r) => r.data.data),
  verify: (payload: { token: string; otp: string }) =>
    apiClient.post('/portal/verify', payload).then((r) => r.data.data),
  dashboard: (token: string) =>
    apiClient.get('/portal/dashboard', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
  appointments: (token: string) =>
    apiClient.get('/portal/appointments', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
  records: (token: string) =>
    apiClient.get('/portal/records', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
  bills: (token: string) =>
    apiClient.get('/portal/bills', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
  messages: (token: string) =>
    apiClient.get('/portal/messages', { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
  logout: (token: string) =>
    apiClient.post('/portal/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.data.data),
};

/** Staff-side portal console (receptionist queues). */
export const staffPortalApi = {
  enrollments: (status?: string) =>
    apiClient.get('/portal/enrollments', { params: { status } }).then((r) => r.data.data),
  approve: (id: string) =>
    apiClient.post(`/portal/enrollments/${id}/approve`).then((r) => r.data.data),
  reject: (id: string, notes?: string) =>
    apiClient.post(`/portal/enrollments/${id}/reject`, { notes }).then((r) => r.data.data),
  otpQueue: () =>
    apiClient.get('/portal/otp-queue').then((r) => r.data.data),
  markSent: (id: string) =>
    apiClient.post(`/portal/otp-queue/${id}/sent`).then((r) => r.data.data),
};
