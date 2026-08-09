import { db } from '../core/database.js';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '@healthcare/shared/config';
import { ForbiddenError, NotFoundError } from '@healthcare/shared/errors';

/**
 * Secure real-time chat (see docs/engineering/AUTHORIZATION.md §6.1, Phase 7).
 *
 * Every access path — WebSocket handshake, history, send, read, participants,
 * online list — verifies (a) the principal exists, (b) the conversation belongs
 * to the principal's tenant, and (c) the principal is a participant recorded in
 * chat_participants (staff via user_id, patients via principal_kind='patient' +
 * patient_id). Membership is re-validated on every message insert; the client
 * is never trusted to name a conversation or message sender.
 */

export interface ChatPrincipal {
  kind: 'user' | 'patient';
  id: string;
  tenantId: string;
  role: string;
}

interface ChatMessage {
  id?: string;
  tenantId: string;
  conversationId: string;
  senderId: string;
  senderRole: 'doctor' | 'patient' | 'staff' | 'admin';
  messageType: 'text' | 'image' | 'file' | 'system';
  content: string;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

interface ChatMessageRow {
  id: string;
  tenant_id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: string;
  message_type: string;
  content: string;
  metadata: Record<string, unknown> | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: Date;
}

interface ChatConversationRow {
  id: string;
  tenant_id: string;
  title: string;
  patient_id: string | null;
  appointment_id: string | null;
  created_by: string | null;
  is_active: boolean;
  last_message_at: Date | null;
  created_at: Date;
}

interface ChatParticipantRow {
  id: string;
  conversation_id: string;
  user_id: string | null;
  patient_id: string | null;
  principal_kind: string;
  tenant_id: string;
  role: string;
  unread_count: number;
  last_read_at: Date | null;
  created_at: Date;
}

interface WsClient {
  principal: ChatPrincipal;
  key: string;
  send: (data: Record<string, unknown>) => void;
}

interface WsSocket {
  close(code: number, reason: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  send(data: string): void;
}

const conversationRooms = new Map<string, Map<string, WsClient>>();

/** True when `principal` is a recorded participant of `conversationId`. */
export async function isConversationMember(conversationId: string, principal: ChatPrincipal): Promise<boolean> {
  const conv = await db('chat_conversations').where({ id: conversationId, tenant_id: principal.tenantId }).first();
  if (!conv) return false;
  const q = db('chat_participants').where({ conversation_id: conversationId, tenant_id: principal.tenantId });
  if (principal.kind === 'user') {
    q.where({ user_id: principal.id });
  } else {
    q.where({ principal_kind: 'patient', patient_id: principal.id });
  }
  const member = await q.first();
  return Boolean(member);
}

/** Throws ForbiddenError unless the principal may access the conversation. */
export async function assertConversationAccess(conversationId: string, principal: ChatPrincipal): Promise<void> {
  const conv = await db('chat_conversations').where({ id: conversationId, tenant_id: principal.tenantId }).first();
  if (!conv) throw new NotFoundError('Conversation not found');
  const member = await isConversationMember(conversationId, principal);
  if (!member) throw new ForbiddenError('You are not a participant of this conversation');
}

/**
 * Resolve a chat principal from a bearer token: staff JWTs first, then portal
 * (OTP) session tokens for patient principals.
 */
export async function resolveChatPrincipal(app: FastifyInstance, token: string): Promise<ChatPrincipal | null> {
  try {
    const jwt = (app as unknown as Record<string, unknown>)['jwt'] as { verify: (t: string) => Record<string, unknown> };
    const payload = jwt.verify(token);
    const userId = String(payload.userId || '');
    const tenantId = String(payload.tenantId || (payload.ctx as Record<string, unknown>)?.tenantId || '');
    if (userId && tenantId) {
      return { kind: 'user', id: userId, tenantId, role: String(payload.role || 'staff') };
    }
  } catch { /* not a staff JWT — fall through to portal session */ }

  const session = await db('portal_sessions')
    .where({ token })
    .where('expires_at', '>', new Date())
    .first();
  if (session?.patient_id) {
    const patient = await db('patients').where({ id: session.patient_id }).whereNull('deleted_at').first();
    if (patient) {
      return { kind: 'patient', id: String(patient.id), tenantId: String(patient.tenant_id), role: 'patient' };
    }
  }
  return null;
}

export function registerChatWsHandlers(app: FastifyInstance): void {
  const env = getEnv();

  if ((app as unknown as Record<string, unknown>).websocket) {
    ((app as unknown as Record<string, unknown>).websocket as (...args: unknown[]) => void)('/api/v1/chat/ws', { options: { maxPayload: 131072 } }, async (socket: WsSocket, req: { url: string }) => {
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const conversationId = url.searchParams.get('conversationId');

      if (!token || !conversationId) {
        socket.close(4001, 'Missing token or conversationId');
        return;
      }

      try {
        const principal = await resolveChatPrincipal(app, token);
        if (!principal) {
          socket.close(4001, 'Invalid token');
          return;
        }

        // Membership + tenant verification before the client can join.
        const member = await isConversationMember(conversationId, principal);
        if (!member) {
          socket.close(4003, 'Not a participant of this conversation');
          return;
        }

        const clientKey = `${principal.kind}:${principal.id}`;
        const client: WsClient = {
          principal,
          key: clientKey,
          send: (data: Record<string, unknown>) => {
            try { socket.send(JSON.stringify(data)); } catch { /* ignore */ }
          },
        };

        if (!conversationRooms.has(conversationId)) {
          conversationRooms.set(conversationId, new Map());
        }
        const room = conversationRooms.get(conversationId)!;
        room.set(clientKey, client);

        broadcastToConversation(conversationId, {
          type: 'user_joined',
          userId: principal.id,
          role: principal.role,
          timestamp: new Date().toISOString(),
        }, clientKey);

        socket.on('message', async (...args: unknown[]) => {
          const raw = String(args[0]);
          try {
            const msg = JSON.parse(raw) as Record<string, unknown>;
            if (msg.type === 'message' && msg.content) {
              // Re-validate membership on every message insert (server-side).
              const saved = await sendChatMessage({
                tenantId: principal.tenantId,
                conversationId,
                senderId: principal.id,
                senderRole: principal.role as 'doctor' | 'patient' | 'staff' | 'admin',
                messageType: (msg.messageType as 'text' | 'image' | 'file') || 'text',
                content: String(msg.content),
                metadata: (msg.metadata as Record<string, unknown>) || null,
              }, principal);

              broadcastToConversation(conversationId, {
                type: 'new_message',
                message: saved,
              }, clientKey);
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error('WS message error:', errorMsg);
          }
        });

        socket.on('close', (..._args: unknown[]) => {
          const room = conversationRooms.get(conversationId);
          if (room) {
            room.delete(clientKey);
            if (room.size === 0) conversationRooms.delete(conversationId);
          }
          broadcastToConversation(conversationId, {
            type: 'user_left',
            userId: principal.id,
            timestamp: new Date().toISOString(),
          }, clientKey);
        });

        const messages = await getConversationMessages(conversationId, principal, 1, 50);
        socket.send(JSON.stringify({ type: 'history', messages: messages.data }));

        socket.on('typing', (...args: unknown[]) => {
          const isTyping = Boolean(args[0]);
          broadcastToConversation(conversationId, {
            type: 'typing',
            userId: principal.id,
            isTyping,
          }, clientKey);
        });
      } catch {
        socket.close(4001, 'Invalid token');
      }
    });
  }
}

function broadcastToConversation(conversationId: string, data: Record<string, unknown>, excludeKey?: string): void {
  const room = conversationRooms.get(conversationId);
  if (!room) return;
  for (const [key, client] of room) {
    if (key !== excludeKey) {
      client.send(data);
    }
  }
}

export async function getOnlineUsers(conversationId: string, principal: ChatPrincipal): Promise<string[]> {
  await assertConversationAccess(conversationId, principal);
  const room = conversationRooms.get(conversationId);
  if (!room) return [];
  return Array.from(room.values()).map((c) => c.principal.id);
}

export async function sendChatMessage(msg: ChatMessage, principal: ChatPrincipal): Promise<ChatMessageRow> {
  // Server-side re-validation: never trust the caller to name a conversation.
  await assertConversationAccess(msg.conversationId, principal);

  const [saved] = await db('chat_messages').insert({
    id: msg.id || undefined,
    tenant_id: msg.tenantId,
    conversation_id: msg.conversationId,
    sender_id: msg.senderId,
    sender_role: msg.senderRole,
    message_type: msg.messageType,
    content: msg.content,
    metadata: msg.metadata ? JSON.stringify(msg.metadata) : null,
  }).returning('*');

  await db('chat_conversations')
    .where({ id: msg.conversationId })
    .update({ last_message_at: db.fn.now(), is_active: true });

  // Increment unread for every participant except the sender.
  const participants = await db('chat_participants').where({ conversation_id: msg.conversationId });
  for (const p of participants) {
    const isSender = principal.kind === 'user'
      ? String(p.user_id) === principal.id
      : String(p.principal_kind) === 'patient' && String(p.patient_id) === principal.id;
    if (!isSender) {
      await db('chat_participants').where({ id: p.id }).increment('unread_count', 1);
    }
  }

  return saved as ChatMessageRow;
}

export async function createConversation(data: {
  tenantId: string;
  title: string;
  participantIds: string[];
  participantRoles: string[];
  patientId?: string;
  appointmentId?: string;
  createdBy: string;
}): Promise<ChatConversationRow> {
  const [conv] = await db('chat_conversations').insert({
    tenant_id: data.tenantId,
    title: data.title,
    patient_id: data.patientId || null,
    appointment_id: data.appointmentId || null,
    created_by: data.createdBy,
  }).returning('*');

  const participants: Array<Record<string, unknown>> = data.participantIds.map((userId, i) => ({
    conversation_id: conv.id,
    user_id: userId,
    principal_kind: 'user',
    role: data.participantRoles[i] || 'staff',
    tenant_id: data.tenantId,
  }));

  if (data.patientId) {
    participants.push({
      conversation_id: conv.id,
      user_id: null,
      patient_id: data.patientId,
      principal_kind: 'patient',
      role: 'patient',
      tenant_id: data.tenantId,
    });
  }

  await db('chat_participants').insert(participants);

  await db('chat_messages').insert({
    tenant_id: data.tenantId,
    conversation_id: conv.id,
    sender_id: 'system',
    sender_role: 'system',
    message_type: 'system',
    content: `Conversation started with ${data.participantIds.length} participants`,
  });

  return conv as ChatConversationRow;
}

export async function getConversations(
  principal: ChatPrincipal,
  page = 1,
  limit = 20
): Promise<{ data: Array<ChatConversationRow & { unread_count: number; last_message: string | null }>; total: number }> {
  const baseQuery = db('chat_conversations as cc')
    .join('chat_participants as cp', 'cc.id', 'cp.conversation_id')
    .where('cc.tenant_id', principal.tenantId);
  if (principal.kind === 'user') {
    baseQuery.where('cp.user_id', principal.id);
  } else {
    baseQuery.where('cp.principal_kind', 'patient').where('cp.patient_id', principal.id);
  }

  const countQuery = baseQuery.clone();
  const total = await countQuery.countDistinct('cc.id as count').first();

  const data = await baseQuery
    .select(
      'cc.*',
      db.raw('cp.unread_count'),
      db.raw('(SELECT content FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) as last_message')
    )
    .orderBy('cc.last_message_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  const seen = new Set<string>();
  const unique = data.filter((r: Record<string, unknown>) => {
    const id = String(r.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }) as Array<ChatConversationRow & { unread_count: number; last_message: string | null }>;

  return { data: unique, total: Number(total?.count || 0) };
}

export async function getConversationMessages(
  conversationId: string,
  principal: ChatPrincipal,
  page = 1,
  limit = 50
): Promise<{ data: ChatMessageRow[]; total: number }> {
  await assertConversationAccess(conversationId, principal);

  const total = await db('chat_messages')
    .where({ conversation_id: conversationId })
    .count('id as count').first();

  const data = await db('chat_messages')
    .where({ conversation_id: conversationId })
    .orderBy('created_at', 'asc')
    .limit(limit)
    .offset((page - 1) * limit);

  return { data: data as ChatMessageRow[], total: Number(total?.count || 0) };
}

export async function markConversationRead(
  conversationId: string,
  principal: ChatPrincipal
): Promise<void> {
  await assertConversationAccess(conversationId, principal);
  const q = db('chat_participants').where({ conversation_id: conversationId, tenant_id: principal.tenantId });
  if (principal.kind === 'user') {
    q.where({ user_id: principal.id });
  } else {
    q.where({ principal_kind: 'patient', patient_id: principal.id });
  }
  await q.update({ unread_count: 0, last_read_at: db.fn.now() });
}

export async function getUnreadCount(principal: ChatPrincipal): Promise<number> {
  const q = db('chat_participants as cp')
    .join('chat_conversations', 'chat_participants.conversation_id', 'chat_conversations.id')
    .where('chat_conversations.tenant_id', principal.tenantId);
  if (principal.kind === 'user') {
    q.where('cp.user_id', principal.id);
  } else {
    q.where('cp.principal_kind', 'patient').where('cp.patient_id', principal.id);
  }
  const result = await q.sum('cp.unread_count as total').first();
  return Number(result?.total || 0);
}

export async function getConversationParticipants(
  conversationId: string,
  principal: ChatPrincipal
): Promise<ChatParticipantRow[]> {
  await assertConversationAccess(conversationId, principal);
  return db('chat_participants')
    .where({ conversation_id: conversationId })
    .select('*') as Promise<ChatParticipantRow[]>;
}
