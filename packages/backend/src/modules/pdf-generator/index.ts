import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendError } from '../../utils/response.js';
import { generateInvoicePdf, generatePrescriptionPdf, generateLabReportPdf } from '../../services/pdf.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerPdfModule(app: FastifyInstance) {

  // Unified PDF generation endpoint
  app.post('/api/v1/pdf/generate', { preHandler: [authenticate, authorize('documents.print')] }, async (request, reply) => {
    const body = z.object({
      documentType: z.enum(['invoice', 'prescription', 'lab_report']),
      entityId: z.string().uuid(),
    }).parse(request.body);

    let buffer: Buffer | null = null;

    switch (body.documentType) {
      case 'invoice': buffer = await generateInvoicePdf(body.entityId); break;
      case 'prescription': buffer = await generatePrescriptionPdf(body.entityId); break;
      case 'lab_report': buffer = await generateLabReportPdf(body.entityId); break;
    }

    if (!buffer) return sendError(reply, `${body.documentType} not found or PDF generation failed`, 404);

    const filename = `${body.documentType}_${body.entityId.substring(0, 8)}.pdf`;
    return reply
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(buffer);
  });

  // Invoice PDF download
  app.get('/api/v1/pdf/invoice/:invoiceId', { preHandler: [authenticate, authorize('billing.print')] }, async (request, reply) => {
    const { invoiceId } = z.object({ invoiceId: z.string().uuid() }).parse(request.params);
    const buffer = await generateInvoicePdf(invoiceId);
    if (!buffer) return sendError(reply, 'Invoice not found', 404);
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="invoice.pdf"`).send(buffer);
  });

  // Prescription PDF download
  app.get('/api/v1/pdf/prescription/:prescriptionId', { preHandler: [authenticate, authorize('pharmacy.print')] }, async (request, reply) => {
    const { prescriptionId } = z.object({ prescriptionId: z.string().uuid() }).parse(request.params);
    const buffer = await generatePrescriptionPdf(prescriptionId);
    if (!buffer) return sendError(reply, 'Prescription not found', 404);
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="prescription.pdf"`).send(buffer);
  });

  // Lab Report PDF download
  app.get('/api/v1/pdf/lab-report/:labOrderId', { preHandler: [authenticate, authorize('laboratory.print')] }, async (request, reply) => {
    const { labOrderId } = z.object({ labOrderId: z.string().uuid() }).parse(request.params);
    const buffer = await generateLabReportPdf(labOrderId);
    if (!buffer) return sendError(reply, 'Lab order not found', 404);
    return reply.type('application/pdf').header('Content-Disposition', `inline; filename="lab-report.pdf"`).send(buffer);
  });

  ('✓ PDF + Reminder module loaded (/pdf/*, /reminders)');
}