import { db } from '../core/database.js';
import { listEffectiveClinicConfiguration } from './clinic-configuration.js';

export interface ClinicDocumentContext {
  displayName: string;
  legalName: string;
  licenseNumber: string;
  taxNumber: string;
  currency: string;
  timezone: string;
  locale: string;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function formatDocumentMoney(value: number | string | null | undefined, currency: string, locale = 'en'): string {
  const safeCurrency = /^[A-Z]{3}$/.test(currency) ? currency : 'EGP';
  const safeLocale = locale.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
  return new Intl.NumberFormat(safeLocale, {
    style: 'currency',
    currency: safeCurrency,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatDocumentDate(value: string | Date, timezone: string, locale = 'en'): string {
  const safeTimezone = isValidTimeZone(timezone) ? timezone : 'UTC';
  const safeLocale = locale.toLowerCase().startsWith('ar') ? 'ar-EG' : 'en-EG';
  return new Intl.DateTimeFormat(safeLocale, {
    year: 'numeric',
    month: locale.toLowerCase().startsWith('ar') ? 'long' : 'short',
    day: 'numeric',
    timeZone: safeTimezone,
  }).format(new Date(value));
}

async function loadClinicDocumentContext(tenantId: string): Promise<ClinicDocumentContext> {
  const [tenant, entries] = await Promise.all([
    db('tenants').where({ id: tenantId }).select('name').first(),
    listEffectiveClinicConfiguration(tenantId),
  ]);
  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  const text = (key: string): string => {
    const value = values.get(key);
    return typeof value === 'string' ? value.trim() : '';
  };
  const locale = text('clinic.locale.default') || 'en';
  const timezone = text('clinic.timezone.default') || 'UTC';
  const currency = text('clinic.finance.currency').toUpperCase();
  return {
    displayName: text('clinic.profile.display_name') || tenant?.name || 'Vision Healthcare',
    legalName: text('clinic.profile.legal_name') || text('clinic.profile.display_name') || tenant?.name || 'Vision Healthcare',
    licenseNumber: text('clinic.legal.license_number'),
    taxNumber: text('clinic.legal.tax_number'),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EGP',
    timezone,
    locale,
  };
}

let pdfMake: any = null;

async function getPdfMake(): Promise<any> {
  if (pdfMake) return pdfMake;
  const printerModule = require('pdfmake/build/pdfmake');
  const vfsFonts = require('pdfmake/build/vfs_fonts');
  pdfMake = printerModule.createPdfPrinter({
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  });
  pdfMake.vfs = pdfMake.vfs || vfsFonts.pdfMake.vfs;
  return pdfMake;
}

export async function generateInvoicePdf(invoiceId: string): Promise<Buffer | null> {
  try {
    const pm = await getPdfMake();
    const invoice = await db('invoices')
      .join('patients', 'invoices.patient_id', 'patients.id')
      .where('invoices.id', invoiceId)
      .select('invoices.*', 'patients.first_name', 'patients.last_name', 'patients.phone', 'patients.email', 'patients.national_id')
      .first();
    if (!invoice) return null;
    const clinic = await loadClinicDocumentContext(invoice.tenant_id);
    const items = typeof invoice.items === 'string' ? JSON.parse(invoice.items) : (invoice.items || []);

    const content: any[] = [
      { columns: [{ text: clinic.displayName, style: 'title', width: '*' }, { text: invoice.invoice_number, style: 'invoiceNumber', width: 'auto', alignment: 'right' }] },
      { text: [
        { text: `${clinic.legalName}\n`, bold: true },
        ...(clinic.licenseNumber ? [{ text: `License: ${clinic.licenseNumber}\n` }] : []),
        ...(clinic.taxNumber ? [{ text: `Tax number: ${clinic.taxNumber}` }] : []),
      ], fontSize: 8, color: 'gray' },
      { text: '', margin: [0, 8] },
      { columns: [
        { width: '*', text: [{ text: 'Patient: ', bold: true }, `${invoice.first_name} ${invoice.last_name}\n`, { text: 'Phone: ', bold: true }, `${invoice.phone || 'N/A'}\n`, { text: 'National ID: ', bold: true }, `${invoice.national_id || 'N/A'}\n`] },
        { width: '*', text: [{ text: 'Date: ', bold: true }, `${formatDocumentDate(invoice.created_at, clinic.timezone, clinic.locale)}\n`, { text: 'Due: ', bold: true }, `${invoice.due_date ? formatDocumentDate(invoice.due_date, clinic.timezone, clinic.locale) : 'N/A'}\n`, { text: 'Status: ', bold: true }, { text: invoice.status.toUpperCase(), color: invoice.status === 'paid' ? 'green' : 'orange' }], alignment: 'right' },
      ]},
      { text: '', margin: [0, 15] },
      { table: { headerRows: 1, widths: [25, '*', 40, 80, 80], body: [
        [{ text: '#', style: 'tableHeader' }, { text: 'Description', style: 'tableHeader' }, { text: 'Qty', style: 'tableHeader', alignment: 'center' }, { text: 'Price', style: 'tableHeader', alignment: 'right' }, { text: 'Total', style: 'tableHeader', alignment: 'right' }],
        ...items.map((item: any, i: number) => [String(i + 1), `${item.description || ''} ${item.code ? '(' + item.code + ')' : ''}`, String(item.quantity), formatDocumentMoney(item.unitPrice, clinic.currency, clinic.locale), formatDocumentMoney(Number(item.quantity || 1) * Number(item.unitPrice || 0), clinic.currency, clinic.locale)]),
      ]}, layout: 'lightHorizontalLines' },
      { text: '', margin: [0, 10] },
      { columns: [{ width: '*', text: '' }, { width: 250, table: { widths: [120, 130], body: [
        ['Subtotal:', formatDocumentMoney(invoice.subtotal ?? invoice.total, clinic.currency, clinic.locale)],
        ...(invoice.discount > 0 ? [['Discount:', formatDocumentMoney(-Number(invoice.discount), clinic.currency, clinic.locale)]] : []),
        ...(invoice.tax > 0 ? [['Tax:', formatDocumentMoney(invoice.tax, clinic.currency, clinic.locale)]] : []),
        [{ text: 'Total:', bold: true }, { text: formatDocumentMoney(invoice.total, clinic.currency, clinic.locale), bold: true }],
        [{ text: 'Paid:', color: 'green', bold: true }, { text: formatDocumentMoney(invoice.paid, clinic.currency, clinic.locale), color: 'green', bold: true }],
        [{ text: 'Due:', color: 'red', bold: true }, { text: formatDocumentMoney(invoice.due, clinic.currency, clinic.locale), color: 'red', bold: true }],
      ]}, layout: 'noBorders' }] },
      { text: '', margin: [0, 20] },
      { text: [{ text: 'Thank you for your visit!\n', bold: true, alignment: 'center' }, { text: `${clinic.displayName}`, alignment: 'center', fontSize: 9, color: 'gray' }] },
    ];

    const docDefinition = { content, defaultStyle: { fontSize: 10, font: 'Roboto' }, styles: { title: { fontSize: 18, bold: true, color: '#2563eb' }, invoiceNumber: { fontSize: 14, bold: true }, tableHeader: { bold: true, fontSize: 9, color: 'white', fillColor: '#2563eb', margin: [4, 4] } }, pageMargins: [40, 40, 40, 40] };

    return new Promise((resolve) => {
      const pdfDoc = pm.createPdf(docDefinition);
      pdfDoc.getBuffer((buffer: Buffer) => resolve(buffer));
    });
  } catch (error: any) {
    console.error('PDF generation failed:', error.message);
    return null;
  }
}

export async function generatePrescriptionPdf(prescriptionId: string): Promise<Buffer | null> {
  try {
    const pm = await getPdfMake();
    const rx = await db('pharmacy_prescriptions')
      .join('patients', 'prescriptions.patient_id', 'patients.id')
      .where('prescriptions.id', prescriptionId)
      .select('prescriptions.*', 'patients.first_name', 'patients.last_name', 'patients.age', 'patients.gender', 'patients.phone')
      .first();
    if (!rx) return null;
    const clinic = await loadClinicDocumentContext(rx.tenant_id);
    const medications = typeof rx.medications === 'string' ? JSON.parse(rx.medications) : (rx.medications || []);

    const content: any[] = [
      { columns: [{ text: clinic.displayName, style: 'title', width: '*' }, { text: 'PRESCRIPTION', width: 'auto', alignment: 'right', style: 'title' }] },
      { text: '', margin: [0, 10] },
      { text: [{ text: 'Patient: ', bold: true }, `${rx.first_name} ${rx.last_name}`, '  ', { text: 'Age/Gender: ', bold: true }, `${rx.age || 'N/A'} / ${rx.gender || 'N/A'}`, '  ', { text: 'Date: ', bold: true }, formatDocumentDate(rx.created_at, clinic.timezone, clinic.locale)] },
      { text: '', margin: [0, 10] },
      ...medications.map((med: any, i: number) => ({ text: [{ text: `${i + 1}. ${med.medication_name || med.name || 'Unknown'}\n`, bold: true }, `   ${med.dosage || ''} ${med.frequency || ''} ${med.duration || ''}\n`, `   ${med.instructions || med.notes || ''}\n`] })),
      ...(medications.length ? [] : [{ text: 'No medications prescribed.', italics: true, color: 'gray' }]),
      { text: '', margin: [0, 15] },
      { text: rx.notes || 'No additional notes.' },
      { text: '', margin: [0, 50] },
      { canvas: [{ type: 'line', x1: 300, y1: 0, x2: 450, y2: 0, lineWidth: 1, lineColor: 'gray' }] },
      { text: 'Doctor\'s Signature', fontSize: 9, color: 'gray', alignment: 'right' },
    ];

    const docDefinition = { content, defaultStyle: { fontSize: 10, font: 'Roboto' }, styles: { title: { fontSize: 16, bold: true, color: '#2563eb' } }, pageMargins: [40, 40, 40, 40] };
    return new Promise((resolve) => { pm.createPdf(docDefinition).getBuffer((buffer: Buffer) => resolve(buffer)); });
  } catch (error: any) {
    console.error('Prescription PDF failed:', error.message);
    return null;
  }
}

export async function generateLabReportPdf(labOrderId: string): Promise<Buffer | null> {
  try {
    const pm = await getPdfMake();
    const order = await db('lab_orders')
      .join('patients', 'lab_orders.patient_id', 'patients.id')
      .where('lab_orders.id', labOrderId)
      .select('lab_orders.*', 'patients.first_name', 'patients.last_name', 'patients.age', 'patients.gender')
      .first();
    if (!order) return null;
    const clinic = await loadClinicDocumentContext(order.tenant_id);
    const results = typeof order.results === 'string' ? JSON.parse(order.results) : (order.results || []);

    const tableRows: any[] = results.length ? [[
      { text: 'Test', style: 'tableHeader' }, { text: 'Result', style: 'tableHeader' }, { text: 'Range', style: 'tableHeader' }, { text: 'Flag', style: 'tableHeader' },
    ], ...results.map((r: any) => [r.test_name || r.name || '', `${r.result || r.value || ''} ${r.unit || ''}`, r.reference_range || r.range || '', { text: r.flag || '-', color: r.flag && r.flag !== 'normal' ? 'red' : 'black', bold: r.flag && r.flag !== 'normal' }])] : [];

    const content: any[] = [
      { columns: [{ text: clinic.displayName, style: 'title', width: '*' }, { text: 'LABORATORY REPORT', width: 'auto', alignment: 'right' }] },
      { text: '', margin: [0, 10] },
      { text: [{ text: 'Patient: ', bold: true }, `${order.first_name} ${order.last_name}`, '  ', { text: 'Test: ', bold: true }, order.test_name || 'N/A', '  ', { text: 'Date: ', bold: true }, formatDocumentDate(order.created_at, clinic.timezone, clinic.locale)] },
      { text: '', margin: [0, 10] },
      ...(tableRows.length ? [{ table: { headerRows: 1, widths: ['*', 100, 100, 50], body: tableRows }, layout: 'lightHorizontalLines' }] : []),
      { text: order.notes || '', italics: true, margin: [0, 10] },
    ];

    const docDefinition = { content, defaultStyle: { fontSize: 10, font: 'Roboto' }, styles: { title: { fontSize: 16, bold: true, color: '#2563eb' }, tableHeader: { bold: true, fontSize: 9, color: 'white', fillColor: '#2563eb', margin: [4, 4] } }, pageMargins: [40, 40, 40, 40] };
    return new Promise((resolve) => { pm.createPdf(docDefinition).getBuffer((buffer: Buffer) => resolve(buffer)); });
  } catch (error: any) {
    console.error('Lab report PDF failed:', error.message);
    return null;
  }
}
