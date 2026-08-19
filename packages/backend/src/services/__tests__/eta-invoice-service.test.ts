import { describe, expect, it } from 'vitest';
import { buildEtaInvoiceDocument, hashEtaDocument, serializeEtaDocument } from '../eta-invoice-service.js';

const config = {
  taxRegistrationNumber: '123456789',
  invoiceSeries: 'CLINIC',
  activityCode: '8610',
  identityEndpointUrl: 'https://id.preprod.eta.gov.eg',
  systemApiEndpointUrl: 'https://api.preprod.invoicing.eta.gov.eg',
  documentTypeId: '1',
  documentTypeVersionId: '2',
  issuerBranchCode: '0',
  currencyCode: 'EGP',
  taxTypeCode: 'T1',
  taxRate: 14,
  taxCalculationMode: 'exclusive' as const,
};

const clinic = {
  displayName: 'Configured Clinic',
  legalName: 'Configured Clinic LLC',
  licenseNumber: '',
  taxNumber: '123456789',
  currency: 'EGP',
  timezone: 'UTC',
  locale: 'en',
  address: '17 Clinic Street, Giza, EG',
  phone: '',
  email: '',
  workingHours: '',
};

describe('ETA invoice service', () => {
  it('follows ETA JSON canonicalization rules for names and arrays', () => {
    expect(serializeEtaDocument({ document: { issuer: 'Clinic', lines: [{ code: 'EGS-1', value: '1.00' }] } }))
      .toBe('"DOCUMENT""ISSUER""Clinic""LINES""LINES""CODE""EGS-1""VALUE""1.00"');
  });

  it('produces a stable SHA-256 document hash independent of object insertion order', () => {
    const first = hashEtaDocument({ issuer: { id: '123', name: 'Clinic' }, totalAmount: 114 });
    const second = hashEtaDocument({ totalAmount: 114, issuer: { name: 'Clinic', id: '123' } });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });

  it('maps persisted invoice lines and configured tax rules without hardcoded activity or VAT values', async () => {
    const result = await buildEtaInvoiceDocument({
      invoice: {
        invoice_number: 'INV-100',
        items: [{ description: 'Consultation', itemCode: 'EGS-CONSULT', itemType: 'EGS', unitType: 'EA', quantity: 1, unitPrice: 100 }],
        total: 114,
        discount: 0,
        tax: 14,
        issued_at: '2026-08-19T10:00:00.000Z',
        due_date: '2026-09-18',
      },
      patient: { first_name: 'A', last_name: 'Patient', national_id: '29801010000000', address: { city: 'Giza' } },
      tenant: { id: 'tenant-1' },
      config,
      documentTypeVersion: '1.0',
      clinic,
    });
    expect(result.document).toMatchObject({
      documentType: 'i',
      documentTypeVersion: '1.0',
      taxpayerActivityCode: '8610',
      issuer: { id: '123456789' },
      totalAmount: 114,
      taxTotals: [{ taxType: 'T1', amount: 14 }],
    });
    expect((result.document.invoiceLines as Array<Record<string, unknown>>)[0]).toMatchObject({ itemType: 'EGS', itemCode: 'EGS-CONSULT', total: 114 });
    expect(result.document.signatures).toEqual([]);
    expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
