import { apiClient } from './client';

export const paymentApi = {
  createStripeSession: (invoiceId: string, amount: number, currency?: string) =>
    apiClient.post('/payments/stripe/create', { invoiceId, amount, ...(currency ? { currency } : {}) }).then(r => r.data.data),
  paymentLink: (invoiceId: string, tenantSlug: string) =>
    apiClient.get(`/payments/link/${tenantSlug}/${invoiceId}`).then(r => r.data.data),
};

export const egyptPaymentApi = {
  fawry: (invoiceId: string, amount: number, customerPhone: string, customerName: string, customerEmail?: string) =>
    apiClient.post('/payments/fawry/create', { invoiceId, amount, customerPhone, customerName, customerEmail }).then(r => r.data.data),
  instapay: (amount: number) =>
    apiClient.post('/payments/instapay', { amount }).then(r => r.data.data),
  etaQr: (invoiceId: string) =>
    apiClient.get(`/invoices/${invoiceId}/eta-qr`).then(r => r.data.data),
};
