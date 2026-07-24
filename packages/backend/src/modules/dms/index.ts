import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { uploadFile, getFile, deleteFile, isImage, isPdf } from '../../services/storage.js';
import { logAudit } from '../../services/audit.js';
import { authenticate } from '../auth-guard.js';

const CATEGORIES = ['lab_report', 'radiology_report', 'prescription', 'consent', 'id_scan', 'insurance', 'medical_record', 'discharge_summary', 'referral', 'other'];

interface DmsDocumentRow {
  id: string;
  tenant_id: string;
  patient_id: string | null;
  title: string;
  category: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number;
  storage_path: string;
  mime_type: string | null;
  description: string | null;
  status: string;
  version: number;
  uploaded_by: string | null;
  ocr_text: unknown;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  pf?: string;
  pl?: string;
}

interface DmsDocumentVersionRow {
  id: string;
  document_id: string;
  version: number;
  file_name: string;
  storage_path: string;
  file_size: number;
  change_notes: string | null;
  uploaded_by: string | null;
  created_at: Date;
}

export async function registerDmsModule(app: FastifyInstance) {

  // ==================== FILE UPLOAD (multipart) ====================
  app.post('/api/v1/dms/upload', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);

    const file = await ((request as unknown as Record<string, unknown>)['file'] as (...args: unknown[]) => Promise<unknown>)() as { fields: Record<string, unknown>; filename: string; mimetype: string; toBuffer: () => Buffer };
    if (!file) return reply.code(400).send({ error: 'No file uploaded' });

    const fields = file.fields as Record<string, unknown>;
    const title = (fields?.title as { value: string })?.value || file.filename;
    const category = (fields?.category as { value: string })?.value || 'other';
    const patientId = (fields?.patientId as { value: string })?.value || null;
    const description = (fields?.description as { value: string })?.value || null;

    const buffer = await file.toBuffer();
    const mimeType = file.mimetype;
    const originalName = file.filename;

    const maxSize = 50 * 1024 * 1024;
    if (buffer.length > maxSize) return reply.code(400).send({ error: 'File too large (max 50MB)' });

    const { storagePath, fileName } = await uploadFile(tenantId, category, buffer, originalName, mimeType);

    const [doc] = await db('documents').insert({
      tenant_id: tenantId,
      patient_id: patientId,
      title,
      category,
      file_name: originalName,
      file_type: mimeType.split('/').pop() || '',
      file_size: buffer.length,
      storage_path: storagePath,
      mime_type: mimeType,
      description,
      uploaded_by: ctx.userId,
    }).returning('*');

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'document.upload', entityType: 'document', entityId: doc.id,
      metadata: { title, category, size: buffer.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { id: doc.id, title: doc.title, fileName: doc.file_name, fileSize: doc.file_size, mimeType: doc.mime_type }, 'File uploaded', 201);
  });

  // ==================== LIST DOCUMENTS ====================
  app.get('/api/v1/dms/documents', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      category: z.string().optional(),
      patientId: z.string().uuid().optional(),
      search: z.string().optional(),
    }).parse(request.query);

    const qb = db('documents').where('documents.tenant_id', tenantId).whereNull('documents.deleted_at');
    if (query.category) qb.andWhere('documents.category', query.category);
    if (query.patientId) qb.andWhere('documents.patient_id', query.patientId);
    if (query.search) qb.andWhere(function() { this.where('title', 'ilike', `%${query.search}%`).orWhere('file_name', 'ilike', `%${query.search}%`); });

    const total = await qb.clone().count('id as count').first();
    const docs = await qb.leftJoin('patients', 'documents.patient_id', 'patients.id')
      .select('documents.*', 'patients.first_name as pf', 'patients.last_name as pl')
      .orderBy('created_at', 'desc')
      .limit(query.limit).offset((query.page - 1) * query.limit);

    return sendPaginated(reply, docs.map((d: DmsDocumentRow) => ({
      id: d.id, title: d.title, category: d.category, fileName: d.file_name,
      fileType: d.file_type, fileSize: d.file_size, mimeType: d.mime_type,
      patientId: d.patient_id, patientName: d.pf ? `${d.pf} ${d.pl}` : null,
      status: d.status, version: d.version, description: d.description,
      uploadedBy: d.uploaded_by, createdAt: d.created_at,
    })), Number((total as Record<string, unknown>)?.count || 0), query.page, query.limit);
  });

  // ==================== GET SINGLE DOCUMENT ====================
  app.get('/api/v1/dms/documents/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const doc = await db('documents').where({ id, tenant_id: tenantId }).whereNull('deleted_at').first();
    if (!doc) return reply.code(404).send({ error: 'Document not found' });

    const versions = await db('document_versions').where({ document_id: id }).orderBy('version', 'desc');
    return sendSuccess(reply, {
      id: doc.id, title: doc.title, category: doc.category, fileName: doc.file_name,
      fileType: doc.file_type, fileSize: doc.file_size, mimeType: doc.mime_type,
      storagePath: doc.storage_path, description: doc.description, status: doc.status,
      version: doc.version, patientId: doc.patient_id, uploadedBy: doc.uploaded_by,
      isImage: isImage(doc.mime_type), isPdf: isPdf(doc.mime_type),
      createdAt: doc.created_at, updatedAt: doc.updated_at,
      versions: versions.map((v: DmsDocumentVersionRow) => ({ id: v.id, version: v.version, fileName: v.file_name, fileSize: v.file_size, changeNotes: v.change_notes, createdAt: v.created_at })),
    });
  });

  // ==================== DOWNLOAD / VIEW FILE ====================
  app.get('/api/v1/dms/files/:id/download', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const doc = await db('documents').where({ id, tenant_id: tenantId }).whereNull('deleted_at').first();
    if (!doc) return reply.code(404).send({ error: 'File not found' });

    const file = await getFile(doc.storage_path);
    if (!file) return reply.code(404).send({ error: 'File not found on storage' });

    reply.header('Content-Type', file.mimeType);
    reply.header('Content-Disposition', `inline; filename="${doc.file_name}"`);
    reply.header('Content-Length', file.buffer.length);
    return reply.send(file.buffer);
  });

  // ==================== DOWNLOAD AS ATTACHMENT ====================
  app.get('/api/v1/dms/files/:id/attachment', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const doc = await db('documents').where({ id, tenant_id: tenantId }).whereNull('deleted_at').first();
    if (!doc) return reply.code(404).send({ error: 'File not found' });

    const file = await getFile(doc.storage_path);
    if (!file) return reply.code(404).send({ error: 'File not found on storage' });

    reply.header('Content-Type', file.mimeType);
    reply.header('Content-Disposition', `attachment; filename="${doc.file_name}"`);
    return reply.send(file.buffer);
  });

  // ==================== UPDATE DOCUMENT ====================
  app.put('/api/v1/dms/documents/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({ title: z.string().optional(), category: z.string().optional(), description: z.string().optional().nullable(), status: z.string().optional() }).parse(request.body);
    const update: Record<string, unknown> = { updated_at: new Date() };
    if (body.title) update.title = body.title;
    if (body.category) update.category = body.category;
    if (body.description !== undefined) update.description = body.description;
    if (body.status) update.status = body.status;
    await db('documents').where({ id, tenant_id: tenantId }).update(update);

    await logAudit({
      tenantId, userId: ctx.userId,
      action: 'document.update', entityType: 'document', entityId: id,
      metadata: { updatedFields: Object.keys(update).filter(k => k !== 'updated_at') },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, null, 'Document updated');
  });

  // ==================== DELETE DOCUMENT ====================
  app.delete('/api/v1/dms/documents/:id', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const doc = await db('documents').where({ id, tenant_id: tenantId }).first();
    if (doc) {
      deleteFile(doc.storage_path);
      await db('documents').where({ id, tenant_id: tenantId }).update({ status: 'deleted', deleted_at: new Date(), updated_at: new Date() });
      await logAudit({
        tenantId, userId,
        action: 'document.delete', entityType: 'document', entityId: id,
        metadata: { title: doc.title },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
      });
    }
    return sendSuccess(reply, null, 'Document deleted');
  });

  // ==================== LIST CATEGORIES ====================
  app.get('/api/v1/dms/categories', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    return sendSuccess(reply, CATEGORIES.map(c => ({ key: c, label: c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) })));
  });

  // ==================== PATIENT DOCUMENTS ====================
  app.get('/api/v1/patients/:patientId/documents', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { patientId } = z.object({ patientId: z.string().uuid() }).parse(request.params);
    const docs = await db('documents').where({ tenant_id: tenantId, patient_id: patientId }).whereNull('deleted_at').orderBy('created_at', 'desc');
    return sendSuccess(reply, docs.map((d: DmsDocumentRow) => ({
      id: d.id, title: d.title, category: d.category, fileName: d.file_name,
      fileType: d.file_type, fileSize: d.file_size, mimeType: d.mime_type,
      isImage: isImage(d.mime_type || ''), createdAt: d.created_at,
    })));
  });
}
