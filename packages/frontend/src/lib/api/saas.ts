import { apiClient } from './client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  category: string;
  description?: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  modules: string[];
  limits: Record<string, unknown>;
  features: string[];
  maxUsers: number;
  maxBranches: number;
  maxStorageGb: number;
}

export interface TenantSubscription {
  id: string;
  planId: string;
  planName: string;
  planSlug: string;
  planCategory: string;
  planModules: string[];
  planFeatures: string[];
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxBranches: number;
  maxStorageGb: number;
  status: string;
  billingCycle: string;
  amount: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEndsAt?: string;
  cancelledAt?: string;
  addons: string[];
  discounts: string[];
}

export interface SaasInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  total: number;
  currency: string;
  status: string;
  paymentMethod?: string;
  paidAt?: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  metric: string;
  quantity: number;
  recordDate: string;
}

export interface UsageTotals {
  metric: string;
  total: number;
}

export interface SaasUsageData {
  records: UsageRecord[];
  totals: UsageTotals[];
}

export interface CreateSubscriptionPayload {
  planId: string;
  billingCycle?: string;
  addons?: string[];
  discounts?: string[];
}

export interface ChangePlanPayload {
  planId: string;
  billingCycle?: string;
}

export const saasApi = {
  listPlans: () =>
    apiClient.get('/saas/plans').then((r) => r.data.data as SubscriptionPlan[]),
  getSubscription: () =>
    apiClient.get('/saas/subscription').then((r) => r.data.data as TenantSubscription | null),
  createSubscription: (data: CreateSubscriptionPayload) =>
    apiClient.post('/saas/subscription', data).then((r) => r.data.data),
  changePlan: (data: ChangePlanPayload) =>
    apiClient.put('/saas/subscription/plan', data).then((r) => r.data.data),
  cancelSubscription: () =>
    apiClient.post('/saas/subscription/cancel').then((r) => r.data.data),
  getUsage: (params?: { metric?: string; days?: number }) =>
    apiClient.get('/saas/usage', { params }).then((r) => r.data.data as SaasUsageData),
  listInvoices: () =>
    apiClient.get('/saas/invoices').then((r) => r.data.data as SaasInvoice[]),
};
