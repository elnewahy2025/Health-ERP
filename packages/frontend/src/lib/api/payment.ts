import { apiClient } from './client';

export interface ManualInstapayReconciliation {
  id: string;
  invoiceId: string;
  paymentTransactionId: string;
  localReference: string;
  status: 'awaiting_transfer' | 'reconciled' | 'rejected';
  requestedAmount: number;
  receivedAmount: number | null;
  currency: string;
  walletIdentifier: string;
  accountName: string;
  instructions: string;
  externalReference: string | null;
  transferDate: string | null;
  decisionNotes: string | null;
  createdBy: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  created?: boolean;
  idempotent?: boolean;
}

export const paymentApi = {
  createStripeSession: (invoiceId: string, amount: number, currency?: string) =>
    apiClient.post('/payments/stripe/create', { invoiceId, amount, ...(currency ? { currency } : {}) }).then(r => r.data.data),
  paymentLink: (invoiceId: string, tenantSlug: string) =>
    apiClient.get(`/payments/link/${tenantSlug}/${invoiceId}`).then(r => r.data.data),
};

export const egyptPaymentApi = {
  fawry: (invoiceId: string, amount: number, customerPhone: string, customerName: string, customerEmail?: string) =>
    apiClient.post('/payments/fawry/create', { invoiceId, amount, customerPhone, customerName, customerEmail }).then(r => r.data.data),
  instapay: (invoiceId: string, amount: number) =>
    apiClient.post('/payments/instapay', { invoiceId, amount }).then(r => r.data.data as ManualInstapayReconciliation),
  instapayHistory: (invoiceId: string) =>
    apiClient.get(`/invoices/${invoiceId}/instapay-reconciliations`).then(r => r.data.data as ManualInstapayReconciliation[]),
  reconcileInstapay: (reconciliationId: string, payload: { externalReference: string; receivedAmount: number; transferDate: string; decisionNotes: string }) =>
    apiClient.post(`/payments/instapay/${reconciliationId}/reconcile`, payload).then(r => r.data.data as ManualInstapayReconciliation),
  rejectInstapay: (reconciliationId: string, decisionNotes: string) =>
    apiClient.post(`/payments/instapay/${reconciliationId}/reject`, { decisionNotes }).then(r => r.data.data as ManualInstapayReconciliation),
  etaQr: (invoiceId: string) =>
    apiClient.get(`/invoices/${invoiceId}/eta-qr`).then(r => r.data.data),
};
