import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';

const MAX_FAVORITES = 30;
const MAX_RECENT_PAGES = 50;

const favoriteSchema = z.object({ path: z.string().min(1).max(255), label: z.string().min(1).max(255) });
const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).min(1).max(MAX_FAVORITES) });
const visitSchema = z.object({ path: z.string().min(1).max(255), label: z.string().min(1).max(255) });

export async function registerNavigationModule(app: FastifyInstance) {
  // ── Favorites ──
  app.get('/api/v1/navigation/favorites', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const favs = await db('user_favorites')
      .where({ tenant_id: tenantId, user_id: ctx.userId })
      .orderBy('position');
    return sendSuccess(reply, favs.map((f: Record<string, unknown>) => ({
      id: f.id, path: f.path, label: f.label, position: f.position,
    })));
  });

  app.post('/api/v1/navigation/favorites', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const body = favoriteSchema.parse(request.body);
    const count = await db('user_favorites').where({ tenant_id: tenantId, user_id: ctx.userId }).count('id as c').first();
    if (Number((count as Record<string, unknown>)?.c || 0) >= MAX_FAVORITES) {
      return reply.status(400).send({ success: false, error: 'Favorite limit reached' });
    }
    const maxPos = await db('user_favorites').where({ tenant_id: tenantId, user_id: ctx.userId }).max('position as m').first();
    const [fav] = await db('user_favorites')
      .insert({
        tenant_id: tenantId, user_id: ctx.userId, path: body.path, label: body.label,
        position: ((maxPos as Record<string, unknown>)?.m as number ?? -1) + 1,
      })
      .onConflict(['user_id', 'path'])
      .merge({ label: body.label })
      .returning('*');
    return sendSuccess(reply, { id: fav.id, path: fav.path, label: fav.label }, 'Favorite added', 201);
  });

  app.delete('/api/v1/navigation/favorites/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const deleted = await db('user_favorites').where({ id, tenant_id: tenantId, user_id: ctx.userId }).delete();
    if (!deleted) return reply.status(404).send({ success: false, error: 'Favorite not found' });
    return sendSuccess(reply, null, 'Favorite removed');
  });

  app.put('/api/v1/navigation/favorites/reorder', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const { orderedIds } = reorderSchema.parse(request.body);
    for (let i = 0; i < orderedIds.length; i += 1) {
      await db('user_favorites')
        .where({ id: orderedIds[i], tenant_id: tenantId, user_id: ctx.userId })
        .update({ position: i });
    }
    return sendSuccess(reply, null, 'Favorites reordered');
  });

  // ── Recent pages ──
  app.get('/api/v1/navigation/visits', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const rows = await db('user_recent_pages')
      .where({ tenant_id: tenantId, user_id: ctx.userId })
      .orderBy('visited_at', 'desc')
      .limit(10);
    return sendSuccess(reply, rows.map((r: Record<string, unknown>) => ({
      path: r.path, label: r.label, visitedAt: r.visited_at,
    })));
  });

  app.post('/api/v1/navigation/visits', { preHandler: [authenticate] }, async (request, reply) => {
    const tenantId = getTenantId(request); const ctx = getCtx(request);
    const body = visitSchema.parse(request.body);
    await db('user_recent_pages')
      .insert({ tenant_id: tenantId, user_id: ctx.userId, path: body.path, label: body.label })
      .onConflict(['user_id', 'path'])
      .merge({ label: body.label, visited_at: db.fn.now() });

    const excess = await db('user_recent_pages')
      .where({ tenant_id: tenantId, user_id: ctx.userId })
      .orderBy('visited_at', 'desc')
      .offset(MAX_RECENT_PAGES)
      .select('id');
    if (excess.length) {
      await db('user_recent_pages').whereIn('id', excess.map((r: Record<string, unknown>) => r.id as string)).delete();
    }
    return sendSuccess(reply, null, 'Visit logged', 201);
  });
}
