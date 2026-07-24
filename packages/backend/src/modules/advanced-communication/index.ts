import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../../core/database.js';
import { getCtx } from '../../utils/route-helper.js';
import { sendSuccess, sendPaginated, sendError } from '../../utils/response.js';
import { sendWhatsAppMessage, getWhatsAppStats, parseWhatsAppWebhook } from '../../services/whatsapp.js';
import { makeVoiceCall, createConferenceCall, getVoiceStats, updateCallStatus, getVoiceCalls } from '../../services/voice.js';
import {
  sendChatMessage, createConversation, getConversations, getConversationMessages,
  markConversationRead, getUnreadCount, getConversationParticipants, getOnlineUsers,
  registerChatWsHandlers,
} from '../../services/chat.js';
import { getEnv } from '@healthcare/shared/config';
import { authenticate } from '../auth-guard.js';
import { logAudit } from '../../services/audit.js';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export async function registerAdvancedCommunicationModule(app: FastifyInstance) {
  const env = getEnv();

  // ==================== WHATSAPP ROUTES ====================

  // WhatsApp Webhook verification (Meta requirement)
  app.get('/api/v1/whatsapp/webhook', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'vision-hc-whatsapp-verify';

    if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === verifyToken) {
      return reply.type('text/plain').send(query['hub.challenge']);
    }
    return reply.status(403).send({ error: 'Verification failed' });
  });

  // WhatsApp Webhook (incoming messages & status updates)
  app.post('/api/v1/whatsapp/webhook', async (request, reply) => {
    try {
      const parsed = parseWhatsAppWebhook(request.body as Record<string, unknown>);

      if (parsed.type === 'message') {
        const fromNumber = parsed.data.from;
        const patient = await db('patients').where({ phone: fromNumber }).whereNull('deleted_at').select('tenant_id', 'id').first();
        const tenantId = patient?.tenant_id || null;

        await db('whatsapp_messages').insert({
          tenant_id: tenantId,
          patient_id: patient?.id || null,
          to_number: fromNumber,
          direction: 'inbound',
          message_type: parsed.data.type || 'text',
          message: parsed.data.text || null,
          status: 'received',
          external_message_id: parsed.data.messageId,
          metadata: JSON.stringify(parsed.data),
        });

        if (tenantId) {
          await logAudit({
            tenantId,
            entityType: 'whatsapp_message',
            action: 'whatsapp.inbound_received',
            metadata: { from: fromNumber, messageId: parsed.data.messageId },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'] as string,
          });
        }
      } else if (parsed.type === 'status') {
        const updateData: Record<string, unknown> = {
          status: parsed.data.status,
        };
        if (parsed.data.status === 'delivered') updateData.delivered_at = db.fn.now();
        if (parsed.data.status === 'read') updateData.read_at = db.fn.now();

        await db('whatsapp_messages')
          .where({ external_message_id: parsed.data.messageId })
          .update(updateData);

        if (parsed.data.status === 'completed' || parsed.data.status === 'failed') {
          await updateCallStatus(String(parsed.data.messageId), (parsed.data.status as string) || 'unknown');
        }
      }

      return reply.status(200).send({ success: true });
    } catch (error: unknown) {
      console.error('WhatsApp webhook error:', getErrorMessage(error));
      return reply.status(200).send({ success: true });
    }
  });

  // Send WhatsApp message
  app.post('/api/v1/whatsapp/send', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      to: z.string().min(1),
      message: z.string().optional(),
      templateName: z.string().optional(),
      templateParams: z.array(z.string()).optional(),
      mediaUrl: z.string().optional(),
      messageType: z.enum(['text', 'template', 'image', 'document']).optional().default('text'),
    }).parse(request.body);

    const result = await sendWhatsAppMessage({
      tenantId,
      to: body.to,
      message: body.message,
      templateName: body.templateName,
      templateParams: body.templateParams,
      mediaUrl: body.mediaUrl,
      messageType: body.messageType,
    });

    await logAudit({
      tenantId,
      userId,
      action: 'whatsapp.message_sent',
      entityType: 'whatsapp_message',
      metadata: { to: body.to, messageType: body.messageType, success: result },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, { sent: result }, result ? 'Message sent successfully' : 'Failed to send message');
  });

  // List WhatsApp messages
  app.get('/api/v1/whatsapp/messages', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      status: z.string().optional(),
    }).parse(request.query);

    let dbQuery = db('whatsapp_messages').where({ tenant_id: tenantId });
    if (query.status) dbQuery = dbQuery.andWhere({ status: query.status });

    const total = await dbQuery.clone().count('id as count').first();
    const data = await dbQuery.clone().orderBy('created_at', 'desc').limit(query.limit).offset((query.page - 1) * query.limit);

    return sendPaginated(reply, data, Number(total?.count || 0), query.page, query.limit);
  });

  // WhatsApp stats
  app.get('/api/v1/whatsapp/stats', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const stats = await getWhatsAppStats(tenantId);
    return sendSuccess(reply, stats);
  });

  // WhatsApp templates
  app.get('/api/v1/whatsapp/templates', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const templates = await db('whatsapp_templates')
      .where(function () { this.whereNull('tenant_id').orWhere('tenant_id', tenantId); })
      .andWhere({ is_active: true })
      .orderBy('name');
    return sendSuccess(reply, templates);
  });

  app.post('/api/v1/whatsapp/templates', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      name: z.string().min(1),
      category: z.string().optional().default('utility'),
      language: z.string().optional().default('en'),
      bodyText: z.string().min(1),
      variables: z.array(z.string()).optional().default([]),
    }).parse(request.body);

    const [template] = await db('whatsapp_templates').insert({
      tenant_id: tenantId,
      name: body.name,
      category: body.category,
      language: body.language,
      body_text: body.bodyText,
      variables: JSON.stringify(body.variables),
    }).returning('*');

    await logAudit({
      tenantId,
      userId,
      action: 'whatsapp.template_created',
      entityType: 'whatsapp_template',
      entityId: template.id,
      metadata: { name: body.name, category: body.category },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, template, 'Template created', 201);
  });

  // ==================== VOICE CALL ROUTES ====================

  // Make a voice call
  app.post('/api/v1/voice/call', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      toNumber: z.string().min(1),
      fromNumber: z.string().optional(),
      patientId: z.string().uuid().optional(),
      appointmentId: z.string().uuid().optional(),
      notes: z.string().optional(),
    }).parse(request.body);

    const voiceEnv = getEnv();
    const result = await makeVoiceCall({
      tenantId,
      fromNumber: body.fromNumber || voiceEnv.TWILIO_PHONE_NUMBER || '+201234567890',
      toNumber: body.toNumber,
      patientId: body.patientId,
      appointmentId: body.appointmentId,
      notes: body.notes,
    });

    await logAudit({
      tenantId,
      userId,
      action: 'voice.call_initiated',
      entityType: 'voice_call',
      metadata: { to: body.toNumber, success: result.success, callSid: result.callSid },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    if (result.success) return sendSuccess(reply, { callSid: result.callSid });
    return sendError(reply, result.error || 'Call failed', 500);
  });

  // Create conference call
  app.post('/api/v1/voice/conference', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      roomName: z.string().optional(),
      participants: z.array(z.object({
        phone: z.string(),
        name: z.string().optional(),
        role: z.enum(['doctor', 'patient', 'staff']),
      })).min(1),
      appointmentId: z.string().uuid().optional(),
    }).parse(request.body);

    const result = await createConferenceCall({
      tenantId,
      roomName: body.roomName || `conf_${Date.now()}`,
      participants: body.participants,
      callType: body.participants.length > 2 ? 'conference' : 'one-on-one',
      appointmentId: body.appointmentId,
    });

    await logAudit({
      tenantId,
      userId,
      action: 'voice.conference_created',
      entityType: 'voice_call',
      metadata: { roomName: body.roomName, participantCount: body.participants.length, success: result.success },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    if (result.success) return sendSuccess(reply, { roomSid: result.roomSid });
    return sendError(reply, result.error || 'Conference creation failed', 500);
  });

  // List voice calls
  app.get('/api/v1/voice/calls', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
      status: z.string().optional(),
      callType: z.string().optional(),
    }).parse(request.query);

    const result = await getVoiceCalls(tenantId, {
      status: query.status,
      callType: query.callType,
      page: query.page,
      limit: query.limit,
    });

    return sendPaginated(reply, result.data, result.total, query.page, query.limit);
  });

  // Voice stats
  app.get('/api/v1/voice/stats', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId } = getCtx(request);
    const stats = await getVoiceStats(tenantId);
    return sendSuccess(reply, stats);
  });

  // Voice call status callback (from Twilio) — validated via signature
  app.post('/api/v1/voice/status', async (request, reply) => {
    try {
      const twilioSignature = request.headers['x-twilio-signature'] as string | undefined;
      const twilioUrl = `${env.APP_URL || 'http://localhost:3000'}/api/v1/voice/status`;

      if (env.TWILIO_AUTH_TOKEN && twilioSignature) {
        const params = request.body as Record<string, string>;
        const sortedKeys = Object.keys(params).sort();
        let dataStr = twilioUrl;
        for (const key of sortedKeys) {
          dataStr += key + (params[key] ?? '');
        }
        const expectedSig = crypto
          .createHmac('sha1', env.TWILIO_AUTH_TOKEN)
          .update(Buffer.from(dataStr, 'utf-8'))
          .digest('base64');

        if (twilioSignature !== expectedSig) {
          return reply.status(403).send({ error: 'Invalid Twilio signature' });
        }
      }

      const body = request.body as Record<string, unknown>;
      const callSid = body.CallSid || body.callSid;
      const status = body.CallStatus || body.status;
      const duration = parseInt(String(body.CallDuration || '0'), 10);

      if (callSid && status) {
        await updateCallStatus(String(callSid), String(status).toLowerCase(), duration);
      }
      return reply.status(200).send({ success: true });
    } catch (error: unknown) {
      console.error('Voice status callback error:', getErrorMessage(error));
      return reply.status(200).send({ success: true });
    }
  });

  // ==================== CHAT ROUTES ====================

  // Register WebSocket handlers for chat (if available)
  registerChatWsHandlers(app);

  // Create conversation
  app.post('/api/v1/chat/conversations', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const body = z.object({
      title: z.string().min(1).max(200),
      participantIds: z.array(z.string().uuid()).min(1),
      participantRoles: z.array(z.enum(['doctor', 'patient', 'staff', 'admin'])).min(1),
      patientId: z.string().uuid().optional(),
      appointmentId: z.string().uuid().optional(),
    }).parse(request.body);

    const conversation = await createConversation({
      tenantId,
      title: body.title,
      participantIds: body.participantIds,
      participantRoles: body.participantRoles,
      patientId: body.patientId,
      appointmentId: body.appointmentId,
      createdBy: userId,
    });

    await logAudit({
      tenantId,
      userId,
      action: 'chat.conversation_created',
      entityType: 'chat_conversation',
      entityId: conversation.id,
      metadata: { title: body.title, participantCount: body.participantIds.length },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, conversation, 'Conversation created', 201);
  });

  // List conversations for current user
  app.get('/api/v1/chat/conversations', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(20),
    }).parse(request.query);

    const result = await getConversations(tenantId, userId, query.page, query.limit);
    return sendPaginated(reply, result.data, result.total, query.page, query.limit);
  });

  // Get conversation messages
  app.get('/api/v1/chat/conversations/:id/messages', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({
      page: z.coerce.number().optional().default(1),
      limit: z.coerce.number().optional().default(50),
    }).parse(request.query);

    const result = await getConversationMessages(id, query.page, query.limit);
    return sendPaginated(reply, result.data, result.total, query.page, query.limit);
  });

  // Send message to conversation (REST fallback)
  app.post('/api/v1/chat/conversations/:id/messages', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId, roles } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = z.object({
      content: z.string().min(1),
      messageType: z.enum(['text', 'image', 'file']).optional().default('text'),
      metadata: z.unknown().optional(),
    }).parse(request.body);

    const msg = await sendChatMessage({
      tenantId,
      conversationId: id,
      senderId: userId,
      senderRole: (roles?.[0] || 'staff') as "doctor" | "patient" | "staff" | "admin",
      messageType: body.messageType,
      content: body.content,
      metadata: (body.metadata as Record<string, unknown>) || null,
    });

    await logAudit({
      tenantId,
      userId,
      action: 'chat.message_sent',
      entityType: 'chat_message',
      entityId: msg.id,
      metadata: { conversationId: id, messageType: body.messageType },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'] as string,
    });

    return sendSuccess(reply, msg, 'Message sent', 201);
  });

  // Mark conversation as read
  app.post('/api/v1/chat/conversations/:id/read', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { userId } = getCtx(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    await markConversationRead(id, userId);
    return sendSuccess(reply, { read: true });
  });

  // Get unread count
  app.get('/api/v1/chat/unread', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { tenantId, userId } = getCtx(request);
    const count = await getUnreadCount(tenantId, userId);
    return sendSuccess(reply, { unreadCount: count });
  });

  // Get conversation participants
  app.get('/api/v1/chat/conversations/:id/participants', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const participants = await getConversationParticipants(id);
    return sendSuccess(reply, participants);
  });

  // Get online users in a conversation
  app.get('/api/v1/chat/conversations/:id/online', { preHandler: [(r: FastifyRequest, rep: FastifyReply) => authenticate(r, rep)] }, async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const online = getOnlineUsers(id);
    return sendSuccess(reply, { onlineUsers: online });
  });
}
