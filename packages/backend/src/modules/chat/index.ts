import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { db } from '../../core/database.js';
import { sendSuccess } from '../../utils/response.js';
import { getCtx, getTenantId } from '../../utils/route-helper.js';
import { authenticate } from '../auth-guard.js';
import { authorize } from '../../services/authorization.js';

export async function registerChatModule(app: FastifyInstance) {

  // List conversations
  app.get('/api/v1/chat/conversations', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };
    const conversations = await db('chat_conversations')
      .where('chat_conversations.tenant_id', tenantId)
      .leftJoin('chat_messages', 'chat_messages.conversation_id', 'chat_conversations.id')
      .groupBy('chat_conversations.id')
      .select(
        'chat_conversations.*',
        db.raw('COUNT(DISTINCT chat_messages.id) as message_count'),
        db.raw('MAX(chat_messages.created_at) as last_message_at')
      )
      .orderBy('last_message_at', 'desc')
      .limit(Number(limit))
      .offset((Number(page) - 1) * Number(limit));
    return sendSuccess(reply, conversations);
  });

  // Get unread counts
  app.get('/api/v1/chat/unread', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const unread = await db('chat_messages')
      .where('chat_messages.tenant_id', tenantId)
      .whereNot('chat_messages.sender_id', ctx.userId)
      .whereNull('chat_messages.read_at')
      .groupBy('chat_messages.conversation_id')
      .select('chat_messages.conversation_id', db.raw('COUNT(*) as count'));
    return sendSuccess(reply, unread);
  });

  // Get messages for a conversation
  app.get('/api/v1/chat/conversations/:id/messages', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params as { id: string };
    const messages = await db('chat_messages')
      .where('chat_messages.tenant_id', tenantId)
      .where('chat_messages.conversation_id', id)
      .leftJoin('users', 'chat_messages.sender_id', 'users.id')
      .select('chat_messages.*', 'users.first_name as sender_first_name', 'users.last_name as sender_last_name')
      .orderBy('chat_messages.created_at', 'asc');
    return sendSuccess(reply, messages);
  });

  // Mark conversation as read
  app.post('/api/v1/chat/conversations/:id/read', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    await db('chat_messages')
      .where('chat_messages.tenant_id', tenantId)
      .where('chat_messages.conversation_id', id)
      .whereNot('chat_messages.sender_id', ctx.userId)
      .whereNull('chat_messages.read_at')
      .update({ read_at: new Date() });
    return sendSuccess(reply, null, 'Marked as read');
  });

  // Send a message
  app.post('/api/v1/chat/conversations/:id/messages', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };
    const [message] = await db('chat_messages').insert({
      tenant_id: tenantId, conversation_id: id, sender_id: ctx.userId, content,
    }).returning('*');
    return sendSuccess(reply, message, 'Message sent', 201);
  });

  // Create a conversation
  app.post('/api/v1/chat/conversations', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const ctx = getCtx(request);
    const { participantIds, name } = request.body as { participantIds: string[]; name?: string };
    const [conv] = await db('chat_conversations').insert({
      tenant_id: tenantId, name: name || null, created_by: ctx.userId,
    }).returning('*');
    // Add participants (creator + selected)
    const allParticipants = [ctx.userId, ...participantIds.filter((p: string) => p !== ctx.userId)];
    const participantRows = allParticipants.map((userId: string) => ({
      conversation_id: conv.id, user_id: userId, tenant_id: tenantId,
    }));
    await db('chat_participants').insert(participantRows);
    return sendSuccess(reply, conv, 'Conversation created', 201);
  });

  // Search participants (users)
  app.get('/api/v1/chat/participants', { preHandler: [authenticate, authorize('chat.view')] }, async (request, reply) => {
    const tenantId = getTenantId(request);
    const { search, limit = 20 } = request.query as { search?: string; limit?: number };
    let q = db('users').where('users.tenant_id', tenantId).where('users.is_active', true);
    if (search) q = q.where(function() {
      this.whereILike('users.first_name', `%${search}%`).orWhereILike('users.last_name', `%${search}%`).orWhereILike('users.email', `%${search}%`);
    });
    const users = await q.select('users.id', 'users.first_name', 'users.last_name', 'users.email').limit(Number(limit));
    return sendSuccess(reply, users);
  });
}
