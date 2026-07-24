import { db } from '../core/database.js';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '@healthcare/shared/config';

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

interface Conversation {
  id: string;
  tenantId: string;
  title: string;
  participantIds: string[];
  participantRoles: string[];
  patientId?: string;
  appointmentId?: string;
  isActive: boolean;
  lastMessageAt?: string;
  unreadCount?: number;
  createdAt: string;
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
  user_id: string;
  tenant_id: string;
  role: string;
  unread_count: number;
  last_read_at: Date | null;
  created_at: Date;
}

interface WsClient {
  userId: string;
  tenantId: string;
  role: string;
  send: (data: Record<string, unknown>) => void;
}

interface WsSocket {
  close(code: number, reason: string): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  send(data: string): void;
}

const conversationRooms = new Map<string, Map<string, WsClient>>();

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
        const jwt = (app as unknown as Record<string, unknown>)['jwt'] as { verify: (t: string) => Record<string, unknown> };
        const payload = jwt.verify(token);
        const client: WsClient = {
          userId: String(payload.userId || ''),
          tenantId: String(payload.tenantId || (payload.ctx as Record<string, unknown>)?.tenantId || ''),
          role: String(payload.role || 'staff'),
          send: (data: Record<string, unknown>) => {
            try { socket.send(JSON.stringify(data)); } catch { /* ignore */ }
          },
        };

        if (!conversationRooms.has(conversationId)) {
          conversationRooms.set(conversationId, new Map());
        }
        const room = conversationRooms.get(conversationId)!;
        room.set(client.userId, client);

        broadcastToConversation(conversationId, {
          type: 'user_joined',
          userId: client.userId,
          role: client.role,
          timestamp: new Date().toISOString(),
        }, client.userId);

        socket.on('message', async (...args: unknown[]) => { const raw = String(args[0]);
          try {
            const msg = JSON.parse(raw) as Record<string, unknown>;
            if (msg.type === 'message' && msg.content) {
              const saved = await sendChatMessage({
                tenantId: client.tenantId,
                conversationId,
                senderId: client.userId,
                senderRole: client.role as 'doctor' | 'patient' | 'staff' | 'admin',
                messageType: (msg.messageType as 'text' | 'image' | 'file') || 'text',
                content: String(msg.content),
                metadata: (msg.metadata as Record<string, unknown>) || null,
              });

              broadcastToConversation(conversationId, {
                type: 'new_message',
                message: saved,
              });
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('WS message error:', msg);
          }
        });

        socket.on('close', (..._args: unknown[]) => {
          const room = conversationRooms.get(conversationId);
          if (room) {
            room.delete(client.userId);
            if (room.size === 0) conversationRooms.delete(conversationId);
          }
          broadcastToConversation(conversationId, {
            type: 'user_left',
            userId: client.userId,
            timestamp: new Date().toISOString(),
          });
        });

        const messages = await getConversationMessages(conversationId, 1, 50);
        socket.send(JSON.stringify({ type: 'history', messages: messages.data }));

        socket.on('typing', (...args: unknown[]) => { const isTyping = Boolean(args[0]);
          broadcastToConversation(conversationId, {
            type: 'typing',
            userId: client.userId,
            isTyping,
          }, client.userId);
        });
      } catch {
        socket.close(4001, 'Invalid token');
      }
    });
  }
}

function broadcastToConversation(conversationId: string, data: Record<string, unknown>, excludeUserId?: string): void {
  const room = conversationRooms.get(conversationId);
  if (!room) return;
  for (const [uid, client] of room) {
    if (uid !== excludeUserId) {
      client.send(data);
    }
  }
}

export function getOnlineUsers(conversationId: string): string[] {
  const room = conversationRooms.get(conversationId);
  if (!room) return [];
  return Array.from(room.keys());
}

export async function sendChatMessage(msg: ChatMessage): Promise<ChatMessageRow> {
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

  await db('chat_participants')
    .where({ conversation_id: msg.conversationId })
    .whereNot('user_id', msg.senderId)
    .increment('unread_count', 1);

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

  const participants = data.participantIds.map((userId, i) => ({
    conversation_id: conv.id,
    user_id: userId,
    role: data.participantRoles[i] || 'staff',
    tenant_id: data.tenantId,
  }));

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
  tenantId: string,
  userId: string,
  page = 1,
  limit = 20
): Promise<{ data: Array<ChatConversationRow & { unread_count: number; last_message: string | null }>; total: number }> {
  const baseQuery = db('chat_conversations as cc')
    .join('chat_participants as cp', 'cc.id', 'cp.conversation_id')
    .where('cc.tenant_id', tenantId)
    .where('cp.user_id', userId);

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
  page = 1,
  limit = 50
): Promise<{ data: ChatMessageRow[]; total: number }> {
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
  userId: string
): Promise<void> {
  await db('chat_participants')
    .where({ conversation_id: conversationId, user_id: userId })
    .update({ unread_count: 0, last_read_at: db.fn.now() });
}

export async function getUnreadCount(
  tenantId: string,
  userId: string
): Promise<number> {
  const result = await db('chat_participants')
    .join('chat_conversations', 'chat_participants.conversation_id', 'chat_conversations.id')
    .where('chat_conversations.tenant_id', tenantId)
    .where('chat_participants.user_id', userId)
    .sum('chat_participants.unread_count as total')
    .first();

  return Number(result?.total || 0);
}

export async function getConversationParticipants(conversationId: string): Promise<ChatParticipantRow[]> {
  return db('chat_participants')
    .where({ conversation_id: conversationId })
    .select('*') as Promise<ChatParticipantRow[]>;
}
