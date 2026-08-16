import { getEnv } from '@healthcare/shared/config';
import { db } from '../core/database.js';

interface VoiceCallOptions {
  tenantId: string;
  fromNumber: string;
  toNumber: string;
  callerId?: string;
  twiml?: string;
  voiceUrl?: string;
  callType?: 'outbound' | 'inbound';
  notes?: string;
  patientId?: string;
  appointmentId?: string;
}

interface ConferenceOptions {
  tenantId: string;
  roomName: string;
  participants: Array<{ phone: string; name?: string; role: 'doctor' | 'patient' | 'staff' }>;
  callType: 'conference' | 'one-on-one';
  appointmentId?: string;
}

interface TwilioCallResult {
  sid: string;
  status: string;
}

interface TwilioClient {
  calls: {
    create(options: Record<string, unknown>): Promise<TwilioCallResult>;
  };
}

let twilioClient: TwilioClient | null = null;

function getTwilioClient(): TwilioClient | null {
  if (twilioClient) return twilioClient;
  const env = getEnv();
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const twilio = require('twilio');
      twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN) as TwilioClient;
      return twilioClient;
    } catch { /* not installed */ }
  }
  return null;
}

export async function makeVoiceCall(options: VoiceCallOptions): Promise<{
  success: boolean;
  callSid?: string;
  error?: string;
}> {
  try {
    const client = getTwilioClient();
    const env = getEnv();

    if (!client) {
      await db('voice_calls').insert({
        tenant_id: options.tenantId,
        patient_id: options.patientId || null,
        appointment_id: options.appointmentId || null,
        call_type: 'outbound',
        from_number: options.fromNumber,
        to_number: options.toNumber,
        status: 'completed',
        duration_seconds: 0,
        notes: options.notes || null,
        external_call_sid: `dev_${Date.now()}`,
      });
      return { success: true, callSid: `dev_${Date.now()}` };
    }

    const call = await client.calls.create({
      to: options.toNumber,
      from: options.fromNumber,
      twiml: options.twiml || `<Response><Say>This is a call from Vision Healthcare.</Say></Response>`,
      url: options.voiceUrl || undefined,
      statusCallback: `${env.APP_URL}/api/v1/advanced-communication/voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    });

    await db('voice_calls').insert({
      tenant_id: options.tenantId,
      patient_id: options.patientId || null,
      appointment_id: options.appointmentId || null,
      call_type: 'outbound',
      from_number: options.fromNumber,
      to_number: options.toNumber,
      status: call.status || 'initiated',
      notes: options.notes || null,
      external_call_sid: call.sid,
    });

    return { success: true, callSid: call.sid };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await db('voice_calls').insert({
      tenant_id: options.tenantId,
      patient_id: options.patientId || null,
      appointment_id: options.appointmentId || null,
      call_type: 'outbound',
      from_number: options.fromNumber,
      to_number: options.toNumber,
      status: 'failed',
      error_message: msg,
      notes: options.notes || null,
    }).catch(() => {});
    return { success: false, error: msg };
  }
}

export async function createConferenceCall(options: ConferenceOptions): Promise<{
  success: boolean;
  roomSid?: string;
  error?: string;
}> {
  try {
    const client = getTwilioClient();
    const env = getEnv();

    if (!client) {
      await db('voice_calls').insert({
        tenant_id: options.tenantId,
        appointment_id: options.appointmentId || null,
        call_type: 'conference',
        from_number: env.TWILIO_PHONE_NUMBER || '+10000000000',
        to_number: options.participants.map(p => p.phone).join(','),
        status: 'completed',
        duration_seconds: 0,
        external_call_sid: `conf_dev_${Date.now()}`,
      });
      return { success: true, roomSid: `conf_dev_${Date.now()}` };
    }

    const roomName = options.roomName || `room_${Date.now()}`;

    for (const participant of options.participants) {
      await client.calls.create({
        to: participant.phone,
        from: env.TWILIO_PHONE_NUMBER,
        twiml: `<Response><Dial><Conference statusCallback="${env.APP_URL}/api/v1/advanced-communication/voice/conf-status" statusCallbackEvent="start end join leave">${roomName}</Conference></Dial></Response>`,
        statusCallback: `${env.APP_URL}/api/v1/advanced-communication/voice/status`,
      });
    }

    await db('voice_calls').insert({
      tenant_id: options.tenantId,
      appointment_id: options.appointmentId || null,
      call_type: 'conference',
      from_number: env.TWILIO_PHONE_NUMBER,
      to_number: options.participants.map(p => p.phone).join(','),
      status: 'initiated',
      external_call_sid: roomName,
    });

    return { success: true, roomSid: roomName };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

export async function getVoiceStats(tenantId: string): Promise<{
  total: number;
  today: number;
  totalMinutes: number;
  byStatus: Array<{ status: string; count: string | number }>;
  byType: Array<{ call_type: string; count: string | number }>;
}> {
  const total = await db('voice_calls').where({ tenant_id: tenantId }).count('id as count').first();
  const byStatus = await db('voice_calls').where({ tenant_id: tenantId })
    .select('status').count('id as count').groupBy('status');
  const byType = await db('voice_calls').where({ tenant_id: tenantId })
    .select('call_type').count('id as count').groupBy('call_type');
  const totalMinutes = await db('voice_calls')
    .where({ tenant_id: tenantId })
    .sum('duration_seconds as total_seconds').first();
  const today = await db('voice_calls')
    .where({ tenant_id: tenantId })
    .whereRaw("created_at >= CURRENT_DATE")
    .count('id as count').first();

  return {
    total: Number(total?.count || 0),
    today: Number(today?.count || 0),
    totalMinutes: Math.round(Number(totalMinutes?.total_seconds || 0) / 60),
    byStatus: byStatus as Array<{ status: string; count: string | number }>,
    byType: byType as Array<{ call_type: string; count: string | number }>,
  };
}

export async function updateCallStatus(
  callSid: string,
  status: string,
  durationSeconds?: number
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
  };
  if (durationSeconds !== undefined) updateData.duration_seconds = durationSeconds;
  if (['completed', 'failed', 'busy', 'no-answer'].includes(status)) {
    updateData.completed_at = db.fn.now();
  }

  await db('voice_calls')
    .where({ external_call_sid: callSid })
    .update(updateData);
}

export async function getVoiceCalls(
  tenantId: string,
  filters: { status?: string; callType?: string; page: number; limit: number }
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  let query = db('voice_calls').where({ tenant_id: tenantId });

  if (filters.status) {
    query = query.andWhere({ status: filters.status });
  }
  if (filters.callType) {
    query = query.andWhere({ call_type: filters.callType });
  }

  const totalQuery = query.clone();
  const total = await totalQuery.count('id as count').first();

  const data = await query
    .orderBy('created_at', 'desc')
    .limit(filters.limit)
    .offset((filters.page - 1) * filters.limit);

  return { data, total: Number(total?.count || 0) };
}
