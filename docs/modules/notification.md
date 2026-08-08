# Module Doc: notification

**Location:** `packages/backend/src/modules/notification/` (+ `communications`, `advanced-communication`, `patient-messaging`)

---

## Purpose
Multi-channel notifications (email, SMS, WhatsApp, in-app), templates, preferences, logs, and advanced communication (chat, voice).

## Responsibilities
- Notification templates + rendering (variables, locales)
- Channel dispatch (SMTP/SendGrid, Twilio SMS, WhatsApp Business API)
- User notification preferences
- Delivery logging + status
- Chat conversations; voice calls (advanced)

## Functional Requirements
- Create notifications via service (in-app + channels)
- Template management (EN/AR)
- Preference per user (channel opt-in)
- Log every dispatch (`notification_logs`)
- Chat: conversations, messages, participants (WebSocket)
- Voice calls: recordings, status

## Non-Functional Requirements
- Delivery via BullMQ with retries + backoff
- Channel outage → fallback channel or deferred retry
- Idempotent dispatch (dedupe by notification key)

## Business Rules
- Respect preferences + consent before sending
- Templates validated before use (missing vars fail loudly in dev)
- Logs retained per retention policy

## Database Entities
`notifications`, `notification_templates`, `notification_preferences`, `notification_logs`, `chat_conversations`, `chat_messages`, `chat_participants`, `voice_calls`, `call_recordings`, `whatsapp_templates`, `whatsapp_messages`.

## API Endpoints
`/api/v1/notifications` (templates, preferences, logs, dispatch), `/api/v1/chat` (WS), `/api/v1/voice`, `/api/v1/communications`.

## User Permissions
`notifications:manage` (templates/prefs), end-user read own notifications; chat participants scoped.

## Dependencies
services (`email.ts`, `sms.ts`, `whatsapp.ts`, `chat.ts`, `voice.ts`, `notification.ts`), BullMQ, patient, appointment, crm.

## Internal Architecture
Service layer delegating to channel adapters; template renderer with i18n variables.

## Data Flow
Trigger → resolve template + prefs → enqueue job → adapter send → log result → retry on failure.

## Validation Rules
Zod: template schema, channel enum, recipient format, variable substitution.

## Error Handling
`ValidationError` (template), provider errors wrapped; delivery failures recorded not thrown to caller.

## Security Considerations
- Consent + preference enforcement; redaction of message content in logs
- WhatsApp webhook verify token; chat authorization via WS

## Logging & Monitoring
Delivery success/failure metrics per channel; alert on failure rate threshold; audit template changes.

## Test Strategy
`notifications.test.ts` — template rendering, preference gating, dispatch logging, retry.

## Future Improvements
- Push notifications (PWA); channel priority routing; digest emails; read receipts.

---

*Related: [Appointment](appointment.md) · [CRM](crm.md) · [Integrations](integrations.md)*
