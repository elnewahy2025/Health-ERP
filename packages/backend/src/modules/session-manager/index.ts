import crypto from 'crypto';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import type { UserSessionRow } from "../types.js";
import { authenticate } from '../auth-guard.js';

export async function registerSessionManagerModule(app: FastifyInstance) {
  // ── Track current session on login ──
  app.post('/api/v1/sessions/register', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const token = request.headers.authorization?.slice(7) || '';
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    // Deactivate old sessions for this token
    await db('user_sessions').where({ token_hash: hash }).update({ is_active: false });

    const [session] = await db('user_sessions').insert({
      tenant_id: tenantId, user_id: ctx.userId, token_hash: hash,
      ip_address: request.ip, user_agent: request.headers['user-agent']?.substring(0, 500) || null,
      device: (request.headers['user-agent'] || '').includes('Mobile') ? 'mobile' : 'desktop',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    }).returning('*');

    return sendSuccess(reply, { id: session.id });
  });

  // ── List active sessions ──
  app.get('/api/v1/sessions', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const sessions = await db('user_sessions').where({ tenant_id: tenantId, user_id: ctx.userId, is_active: true })
      .where('expires_at', '>', new Date())
      .orderBy('last_activity_at', 'desc');
    return sendSuccess(reply, sessions.map((s: Record<string, unknown>) => ({
      id: s.id, device: s.device, ipAddress: s.ip_address,
      userAgent: String(s.user_agent || "").substring(0, 100),
      location: s.location, lastActivityAt: s.last_activity_at,
      createdAt: s.created_at, expiresAt: s.expires_at,
      isCurrent: s.token_hash === crypto.createHash('sha256').update((request.headers.authorization || '').slice(7)).digest('hex')
    })));
  });

  // ── Force logout a session ──
  app.post('/api/v1/sessions/:id/logout', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request); const { id } = request.params as { id: string };
    const session = await db('user_sessions').where({ id, tenant_id: tenantId, user_id: ctx.userId }).first();
    if (!session) return reply.status(404).send({ success: false, error: 'Session not found' });
    await db('user_sessions').where({ id }).update({ is_active: false });
    return sendSuccess(reply, null, 'Session terminated');
  });

  // ── Force logout all other sessions ──
  app.post('/api/v1/sessions/logout-others', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const currentHash = crypto.createHash('sha256').update((request.headers.authorization || '').slice(7)).digest('hex');
    await db('user_sessions').where({ tenant_id: tenantId, user_id: ctx.userId, is_active: true })
      .whereNot('token_hash', currentHash)
      .update({ is_active: false });
    return sendSuccess(reply, null, 'Other sessions terminated');
  });

  // ── Security info ──
  app.get('/api/v1/sessions/security-info', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const activeSessions = await db('user_sessions').where({ tenant_id: tenantId, user_id: ctx.userId, is_active: true }).count('id as c').first();
    const lastSession = await db('user_sessions').where({ tenant_id: tenantId, user_id: ctx.userId }).orderBy('created_at', 'desc').first();
    return sendSuccess(reply, {
      activeSessions: Number((activeSessions as Record<string, unknown>)?.c || 0),
      lastLogin: lastSession?.created_at || null,
      lastIp: lastSession?.ip_address || null,
      lastDevice: lastSession?.device || null,
    });
  });
}
