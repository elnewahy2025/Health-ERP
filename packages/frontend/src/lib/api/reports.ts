import { apiClient } from './client';

export interface ReportColumn {
  header: string;
  accessor: string;
  type?: string;
  width?: number;
}

export interface ReportSchedule {
  id: string;
  reportId: string;
  cron: string;
  recipients: string[];
  format: string;
  params: Record<string, unknown>;
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdAt: string;
}

export interface ReportExecution {
  id: string;
  reportId: string;
  status: string;
  format: string;
  error?: string;
  rowCount: number;
  fileSize?: number | null;
  fileName?: string | null;
  downloadAvailable?: boolean;
  artifactExpiresAt?: string | null;
  artifactDeletedAt?: string | null;
  trigger: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface ReportSource {
  source: string;
  table: string;
  columns: string[];
  formats: string[];
}

export interface ReportDefinition {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  queryConfig: Record<string, unknown>;
  columns: ReportColumn[];
  filters: Record<string, unknown>[];
  sorting: Record<string, unknown>[];
  exportFormats: string[];
  isScheduled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportPayload {
  name: string;
  slug?: string;
  category?: string;
  description?: string;
  queryConfig?: Record<string, unknown>;
  columns?: ReportColumn[];
  filters?: Record<string, unknown>[];
  sorting?: Record<string, unknown>[];
  exportFormats?: string[];
}

export interface CreateSchedulePayload {
  cron?: string;
  recipients?: string[];
  format?: string;
  params?: Record<string, unknown>;
  isActive?: boolean;
}

export const reportsApi = {
  list: (params?: { category?: string }) =>
    apiClient.get('/reports', { params }).then((r) => r.data.data as ReportDefinition[]),
  create: (data: CreateReportPayload) =>
    apiClient.post('/reports', data).then((r) => r.data.data as ReportDefinition),
  update: (id: string, data: Partial<CreateReportPayload>) =>
    apiClient.put(`/reports/${id}`, data).then((r) => r.data.data),
  delete: (id: string) =>
    apiClient.delete(`/reports/${id}`).then((r) => r.data.data),
  listSchedules: (reportId: string) =>
    apiClient.get(`/reports/${reportId}/schedules`).then((r) => r.data.data as ReportSchedule[]),
  createSchedule: (reportId: string, data: CreateSchedulePayload) =>
    apiClient.post(`/reports/${reportId}/schedules`, data).then((r) => r.data.data as ReportSchedule),
  updateSchedule: (id: string, data: Partial<CreateSchedulePayload>) =>
    apiClient.put(`/reports/schedules/${id}`, data).then((r) => r.data.data),
  listExecutions: (reportId: string) =>
    apiClient.get(`/reports/${reportId}/executions`).then((r) => r.data.data as ReportExecution[]),
  execute: (reportId: string, data?: { format?: string; params?: Record<string, unknown>; retentionDays?: number }) =>
    apiClient.post(`/reports/${reportId}/execute`, data).then((r) => r.data.data as ReportExecution),
  sources: () => apiClient.get('/reports/sources').then((r) => r.data.data as ReportSource[]),
  download: (executionId: string, format: string) =>
    apiClient.get(`/reports/export/${executionId}/${format}`, { responseType: 'blob' }).then((r) => r.data as Blob),
};
